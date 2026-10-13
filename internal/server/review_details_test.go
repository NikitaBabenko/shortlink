package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"ai-shortlink/internal/model"
)

func decodeReviewData[T any](t *testing.T, body []byte) T {
	t.Helper()
	var response struct {
		Data T `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatalf("decode review response: %v", err)
	}
	return response.Data
}

func TestApprovalDetailsIncludeContentAndEnforceTenantBoundaries(t *testing.T) {
	fx := newAuthorizationFixture(t)
	ctx := context.Background()
	tenant, _, err := fx.st.EnsurePersonalTenant(ctx, fx.owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = fx.st.SaveShortLinkTargets(ctx, fx.ownerShort.ID, tenant.ID, "round_robin", []model.ShortLinkTarget{{Name: "Campaign target", TargetURL: "https://example.com/campaign", Status: "active", Weight: 1}})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		typeName string
		id       int64
		content  string
	}{
		{"short_link", fx.ownerShort.ID, "https://example.com/campaign"},
		{"live_qr", fx.ownerLive.ID, "https://example.com/qr.png"},
		{"live_qr_item", fx.ownerItem.ID, "https://example.com/qr.png"},
	} {
		t.Run(tc.typeName, func(t *testing.T) {
			path := fmt.Sprintf("/api/admin/saas/platform/reviews/%s/%d", tc.typeName, tc.id)
			rr := authzRequest(t, fx.handler, http.MethodGet, path, "", fx.adminCookies)
			requireStatus(t, rr, http.StatusOK)
			detail := decodeReviewData[model.ApprovalDetail](t, rr.Body.Bytes())
			if detail.Tenant.ID != tenant.ID || detail.Owner.Email != fx.owner.Email || detail.ContentVersion < 1 {
				t.Fatalf("incorrect submission metadata: %+v", detail)
			}
			if !strings.Contains(rr.Body.String(), tc.content) {
				t.Fatalf("missing submitted content: %s", rr.Body.String())
			}
			for _, secret := range []string{"recovery_key", "hash-owner", "cipher-owner"} {
				if strings.Contains(rr.Body.String(), secret) {
					t.Fatalf("detail leaked account credentials: %s", secret)
				}
			}
			rr = authzRequest(t, fx.handler, http.MethodGet, path, "", fx.ownerCookies)
			requireStatus(t, rr, http.StatusForbidden)
			rr = authzRequest(t, fx.handler, http.MethodGet, strings.Replace(path, "/platform", "", 1), "", fx.ownerCookies)
			requireStatus(t, rr, http.StatusOK)
			rr = authzRequest(t, fx.handler, http.MethodGet, strings.Replace(path, "/platform", "", 1), "", fx.adminCookies)
			requireStatus(t, rr, http.StatusNotFound)
		})
	}
	member := mustCreateAccount(t, fx.st, "member@example.com", "Member", "user")
	memberCookies := authzCookies(t, fx.srv, fx.st, member)
	for _, role := range []string{"member", "analyst", "reviewer"} {
		if _, err := fx.st.UpsertTenantMember(ctx, tenant.ID, member.ID, role, "active"); err != nil {
			t.Fatal(err)
		}
		rr := authzRequest(t, fx.handler, http.MethodGet, fmt.Sprintf("/api/admin/saas/reviews/short_link/%d", fx.ownerShort.ID), "", memberCookies)
		want := http.StatusForbidden
		if role == "reviewer" {
			want = http.StatusOK
		}
		requireStatus(t, rr, want)
	}
}

func TestSubscriptionReviewDetailIncludesPlansApplicantAndUsage(t *testing.T) {
	fx := newAuthorizationFixture(t)
	ctx := context.Background()
	tenant, _, err := fx.st.EnsurePersonalTenant(ctx, fx.owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	plans, err := fx.st.ListPlans(ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	var pro model.Plan
	for _, plan := range plans {
		if plan.Code == "pro" {
			pro = plan
		}
	}
	request, err := fx.st.RequestPlanChange(ctx, tenant.ID, fx.owner.ID, pro.ID, "Need more members for the campaign")
	if err != nil {
		t.Fatal(err)
	}
	path := fmt.Sprintf("/api/admin/saas/platform/subscription-requests/%d", request.ID)
	rr := authzRequest(t, fx.handler, http.MethodGet, path, "", fx.adminCookies)
	requireStatus(t, rr, http.StatusOK)
	detail := decodeReviewData[model.SubscriptionRequestDetail](t, rr.Body.Bytes())
	if detail.Request.Note != request.Note || detail.Requester.Email != fx.owner.Email || detail.TenantOwner.ID != fx.owner.ID || detail.FromPlan.Code != "free" || detail.ToPlan.ID != pro.ID || detail.ToPlan.PriceMonthlyCents != 4900 || detail.Quota.ShortLinksUsed != 1 || detail.Quota.LiveQRsUsed != 1 || detail.Quota.MembersUsed != 1 {
		t.Fatalf("incomplete subscription detail: %+v", detail)
	}
	rr = authzRequest(t, fx.handler, http.MethodGet, path, "", fx.ownerCookies)
	requireStatus(t, rr, http.StatusForbidden)
	for _, badPath := range []string{"0", "abc", fmt.Sprintf("%d/extra", request.ID)} {
		rr = authzRequest(t, fx.handler, http.MethodGet, "/api/admin/saas/platform/subscription-requests/"+badPath, "", fx.adminCookies)
		requireStatus(t, rr, http.StatusBadRequest)
	}
	rr = authzRequest(t, fx.handler, http.MethodPost, path, `{"action":"approve","note":"Usage and requested limits verified"}`, fx.adminCookies)
	requireStatus(t, rr, http.StatusOK)
	rr = authzRequest(t, fx.handler, http.MethodGet, path, "", fx.adminCookies)
	requireStatus(t, rr, http.StatusOK)
	detail = decodeReviewData[model.SubscriptionRequestDetail](t, rr.Body.Bytes())
	if detail.Request.Status != "approved" || detail.Quota.Plan.ID != pro.ID {
		t.Fatalf("review did not update subscription: %+v", detail)
	}
}

func TestReviewRejectsContentChangedAfterOpeningDetails(t *testing.T) {
	fx := newAuthorizationFixture(t)
	ctx := context.Background()
	tenant, _, err := fx.st.EnsurePersonalTenant(ctx, fx.owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourceTenant(ctx, tenant.ID, fx.owner.ID, "short_link", fx.ownerShort.ID, "approve", "Initial review", false); err != nil {
		t.Fatal(err)
	}
	path := fmt.Sprintf("/api/admin/saas/platform/reviews/short_link/%d", fx.ownerShort.ID)
	rr := authzRequest(t, fx.handler, http.MethodGet, path, "", fx.adminCookies)
	requireStatus(t, rr, http.StatusOK)
	detail := decodeReviewData[model.ApprovalDetail](t, rr.Body.Bytes())
	if len(detail.Events) != 1 || detail.Events[0].ActorName != "Owner" || detail.Events[0].Note != "Initial review" {
		t.Fatalf("missing tenant review history: %+v", detail.Events)
	}
	_, err = fx.st.SaveShortLinkTargets(ctx, fx.ownerShort.ID, tenant.ID, "single", []model.ShortLinkTarget{{TargetURL: "https://example.com/changed", Status: "active", Weight: 1}})
	if err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourceTenant(ctx, tenant.ID, fx.owner.ID, "short_link", fx.ownerShort.ID, "approve", "Updated content", false); err != nil {
		t.Fatal(err)
	}
	rr = authzRequest(t, fx.handler, http.MethodPost, path, fmt.Sprintf(`{"action":"approve","content_version":%d}`, detail.ContentVersion), fx.adminCookies)
	requireStatus(t, rr, http.StatusConflict)
	updated, err := fx.st.GetShortLinkForTenant(ctx, fx.ownerShort.ID, tenant.ID, false)
	if err != nil || updated.ApprovalStatus != "platform_pending" {
		t.Fatalf("stale review changed approval state: %+v, err=%v", updated, err)
	}
	rr = authzRequest(t, fx.handler, http.MethodPost, path, fmt.Sprintf(`{"action":"approve","content_version":%d}`, updated.ContentVersion), fx.adminCookies)
	requireStatus(t, rr, http.StatusOK)
}

func TestReviewQueueIncludesQRItemsWhenParentNotPending(t *testing.T) {
	fx := newAuthorizationFixture(t)
	ctx := context.Background()
	tenant, _, err := fx.st.EnsurePersonalTenant(ctx, fx.owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := fx.st.BindLiveQRItemAndReset(ctx, fx.ownerItem.ID, fx.ownerLive.ID, tenant.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourceTenant(ctx, tenant.ID, fx.owner.ID, "live_qr", fx.ownerLive.ID, "approve", "", true); err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourcePlatform(ctx, fx.admin.ID, "live_qr", fx.ownerLive.ID, "approve", "", false); err != nil {
		t.Fatal(err)
	}
	rr := authzRequest(t, fx.handler, http.MethodGet, "/api/admin/saas/platform/reviews", "", fx.adminCookies)
	requireStatus(t, rr, http.StatusOK)
	items := decodeReviewData[[]model.ApprovalQueueItem](t, rr.Body.Bytes())
	if len(items) != 1 || items[0].ResourceType != "live_qr_item" || items[0].ResourceID != fx.ownerItem.ID {
		t.Fatalf("pending QR item missing from queue: %+v", items)
	}
}

func TestTenantBundleReviewOnlyIncludesItemsAtTenantStage(t *testing.T) {
	fx := newAuthorizationFixture(t)
	ctx := context.Background()
	tenant, _, err := fx.st.EnsurePersonalTenant(ctx, fx.owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := fx.st.BindLiveQRItemAndReset(ctx, fx.ownerItem.ID, fx.ownerLive.ID, tenant.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourceTenant(ctx, tenant.ID, fx.owner.ID, "live_qr_item", fx.ownerItem.ID, "approve", "", false); err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourcePlatform(ctx, fx.admin.ID, "live_qr_item", fx.ownerItem.ID, "approve", "", false); err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourceTenant(ctx, tenant.ID, fx.owner.ID, "live_qr", fx.ownerLive.ID, "approve", "", true); err != nil {
		t.Fatal(err)
	}
	item, err := fx.st.GetLiveQRItemByID(ctx, fx.ownerItem.ID)
	if err != nil || item.ApprovalStatus != "approved" {
		t.Fatalf("bundle review reset an already approved QR item: %+v, err=%v", item, err)
	}
}
