package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"ai-shortlink/internal/model"
)

func (s *Store) reviewAccount(ctx context.Context, id int64) (*model.ReviewAccount, error) {
	var account model.ReviewAccount
	err := s.db.QueryRowContext(ctx, `SELECT id,name,COALESCE(email,'') FROM admin_accounts WHERE id=?`, id).Scan(&account.ID, &account.Name, &account.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &account, err
}

func (s *Store) GetApprovalDetail(ctx context.Context, tenantID int64, resourceType string, resourceID int64, platform bool) (*model.ApprovalDetail, error) {
	actualTenant, err := s.ResourceTenantID(ctx, resourceType, resourceID)
	if err != nil {
		return nil, err
	}
	if !platform && actualTenant != tenantID {
		return nil, ErrNotFound
	}
	table, _, _ := resourceTable(resourceType)
	versionQuery := fmt.Sprintf(`SELECT content_version FROM %s WHERE id=?`, table)
	var initialVersion int64
	if err := s.db.QueryRowContext(ctx, versionQuery, resourceID).Scan(&initialVersion); err != nil {
		return nil, err
	}
	tenant, err := s.GetTenant(ctx, actualTenant)
	if err != nil {
		return nil, err
	}
	detail := &model.ApprovalDetail{ResourceType: resourceType, Tenant: *tenant}
	ownerID := tenant.OwnerAccountID
	switch resourceType {
	case "short_link":
		resource, err := s.GetShortLinkForTenant(ctx, resourceID, actualTenant, true)
		if err != nil {
			return nil, err
		}
		detail.Resource, detail.ContentVersion = resource, resource.ContentVersion
		if resource.OwnerAccountID != 0 {
			ownerID = resource.OwnerAccountID
		}
	case "live_qr", "live_qr_item":
		liveID := resourceID
		if resourceType == "live_qr_item" {
			item, err := s.GetLiveQRItemByID(ctx, resourceID)
			if err != nil {
				return nil, err
			}
			liveID = item.LiveQRID
			detail.Resource = item
			if err := s.db.QueryRowContext(ctx, `SELECT content_version FROM live_qr_items WHERE id=?`, resourceID).Scan(&detail.ContentVersion); err != nil {
				return nil, err
			}
		}
		live, err := s.GetLiveQRForTenant(ctx, liveID, actualTenant)
		if err != nil {
			return nil, err
		}
		if live.OwnerAccountID != 0 {
			ownerID = live.OwnerAccountID
		}
		if resourceType == "live_qr" {
			live.Items, err = s.ListLiveQRItems(ctx, liveID)
			if err != nil {
				return nil, err
			}
			detail.Resource, detail.ContentVersion = live, live.ContentVersion
		} else {
			detail.Parent = live
		}
	}
	detail.Owner, err = s.reviewAccount(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	detail.Events, err = s.ListApprovalEvents(ctx, actualTenant, resourceType, resourceID)
	if err != nil {
		return nil, err
	}
	var latestVersion int64
	if err := s.db.QueryRowContext(ctx, versionQuery, resourceID).Scan(&latestVersion); err != nil {
		return nil, err
	}
	if initialVersion != detail.ContentVersion || latestVersion != detail.ContentVersion {
		return nil, fmt.Errorf("%w: content changed; reload the review details", ErrApprovalState)
	}
	return detail, nil
}

func (s *Store) GetSubscriptionRequestDetail(ctx context.Context, id int64) (*model.SubscriptionRequestDetail, error) {
	request, err := s.GetSubscriptionRequest(ctx, id)
	if err != nil {
		return nil, err
	}
	tenant, err := s.GetTenant(ctx, request.TenantID)
	if err != nil {
		return nil, err
	}
	fromPlan, err := scanPlan(s.db.QueryRowContext(ctx, planSelectSQL+` WHERE id=?`, request.FromPlanID))
	if err != nil {
		return nil, err
	}
	toPlan, err := scanPlan(s.db.QueryRowContext(ctx, planSelectSQL+` WHERE id=?`, request.ToPlanID))
	if err != nil {
		return nil, err
	}
	quota, err := s.GetTenantQuotaSnapshot(ctx, request.TenantID)
	if err != nil {
		return nil, err
	}
	requester, err := s.reviewAccount(ctx, request.RequestedBy)
	if err != nil {
		return nil, err
	}
	owner, err := s.reviewAccount(ctx, tenant.OwnerAccountID)
	if err != nil {
		return nil, err
	}
	return &model.SubscriptionRequestDetail{Request: *request, Tenant: *tenant, Requester: requester, TenantOwner: owner, FromPlan: *fromPlan, ToPlan: *toPlan, Quota: *quota}, nil
}
