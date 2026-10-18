package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"ai-shortlink/internal/config"
	"ai-shortlink/internal/dbutil"
	"ai-shortlink/internal/store"
)

func newSetupAuthServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "ai-shortlink.db")
	db, err := dbutil.Open(context.Background(), "embedded", "", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := dbutil.Migrate(context.Background(), db, "embedded"); err != nil {
		t.Fatal(err)
	}
	s, err := New(config.Config{AppName: "Test", DataDir: dir, SQLitePath: dbPath, DatabaseMode: "embedded", AppSecret: "test-app-secret", SessionTTL: time.Hour, CookieSecure: true, VibeNestPilot: true, SetupBootstrapUser: "operator", SetupBootstrapPassword: "test-bootstrap-password-for-router"}, store.New(db, "embedded"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func setupAuthRequest(h http.Handler, method, path, body, credential string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	switch credential {
	case "valid":
		r.SetBasicAuth("operator", "test-bootstrap-password-for-router")
	case "wrong-user":
		r.SetBasicAuth("wrong", "test-bootstrap-password-for-router")
	case "wrong-password":
		r.SetBasicAuth("operator", "wrong")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestSetupAuthRouterRejectsEverySetupRouteAndMethod(t *testing.T) {
	s := newSetupAuthServer(t)
	h := s.Routes()
	blockedDB := filepath.Join(s.cfg.DataDir, "must-not-exist.db")
	payload, _ := json.Marshal(map[string]string{"sqlite_path": blockedDB, "admin_email": "admin@example.com"})
	for _, method := range []string{"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"} {
		for _, path := range []string{"/setup", "/setup/", "/api/setup", "/api/setup/test-db", "/api/setup/install", "/api/setup/unknown", "/x/../setup", "/api//setup/install", "/%73etup", "/api%2fsetup/install"} {
			for _, credential := range []string{"anonymous", "wrong-user", "wrong-password"} {
				t.Run(method+path+credential, func(t *testing.T) {
					w := setupAuthRequest(h, method, path, string(payload), credential)
					if w.Code != 401 || w.Header().Get("WWW-Authenticate") == "" {
						t.Fatalf("status=%d, want authentication challenge", w.Code)
					}
					if len(w.Result().Cookies()) != 0 {
						t.Fatal("unauthorized setup issued cookies")
					}
				})
			}
		}
	}
	if _, err := os.Stat(blockedDB); !os.IsNotExist(err) {
		t.Fatalf("unauthorized request created a database: %v", err)
	}
	count, err := s.store().CountAdminAccounts(context.Background())
	if err != nil || count != 0 || s.isInstalled(context.Background()) {
		t.Fatal("unauthorized request changed installation")
	}
}

func TestSetupAuthRouterAllowsAuthenticatedInstall(t *testing.T) {
	s := newSetupAuthServer(t)
	h := s.Routes()
	for _, path := range []string{"/api/setup/test-db", "/api/setup/install"} {
		for _, method := range []string{"GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"} {
			w := setupAuthRequest(h, method, path, "", "valid")
			if w.Code != 405 {
				t.Fatalf("%s %s got %d, want handler's 405", method, path, w.Code)
			}
		}
	}
	if w := setupAuthRequest(h, "GET", "/setup", "", "valid"); w.Code != 200 {
		t.Fatalf("setup page: %d", w.Code)
	}
	if w := setupAuthRequest(h, "POST", "/api/setup/test-db", `{}`, "valid"); w.Code != 200 {
		t.Fatalf("DB test: %d %s", w.Code, w.Body.String())
	}
	w := setupAuthRequest(h, "POST", "/api/setup/install", `{"admin_email":"admin@example.com","admin_name":"Test operator","default_locale":"en"}`, "valid")
	if w.Code != 200 || !s.isInstalled(context.Background()) {
		t.Fatalf("install: %d %s", w.Code, w.Body.String())
	}
	if len(w.Result().Cookies()) == 0 {
		t.Fatal("install did not create a session")
	}
	for _, cookie := range w.Result().Cookies() {
		if !cookie.Secure {
			t.Fatal("HTTPS installation cookie is not Secure")
		}
	}
	if w := setupAuthRequest(h, "POST", "/api/setup/install", `{}`, "valid"); w.Code != 409 {
		t.Fatalf("repeat install: %d", w.Code)
	}
	if w := setupAuthRequest(h, "GET", "/setup", "", "valid"); w.Code != 302 || w.Header().Get("Location") != "/login" {
		t.Fatalf("installed setup: %d", w.Code)
	}
	for _, path := range []string{"/setup", "/api/setup/test-db", "/api/setup/install"} {
		if w := setupAuthRequest(h, "POST", path, `{}`, "anonymous"); w.Code != 401 {
			t.Fatalf("installed %s unprotected: %d", path, w.Code)
		}
	}
	b, err := os.ReadFile(config.RuntimePath(s.cfg.DataDir))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), s.cfg.SetupBootstrapPassword) {
		t.Fatal("bootstrap password persisted to runtime config")
	}
}

func TestSetupAuthRouterMissingCredentialsFailsClosed(t *testing.T) {
	s := newSetupAuthServer(t)
	for _, pair := range [][2]string{{"", "password"}, {"operator", ""}, {"", ""}} {
		s.cfg.SetupBootstrapUser, s.cfg.SetupBootstrapPassword = pair[0], pair[1]
		h := s.Routes()
		for _, path := range []string{"/setup", "/api/setup/test-db", "/api/setup/install", "/api/setup/unknown"} {
			if w := setupAuthRequest(h, "POST", path, `{}`, "valid"); w.Code != 503 {
				t.Fatalf("missing credentials %s: %d", path, w.Code)
			}
		}
		if w := setupAuthRequest(h, "GET", "/healthz", "", "anonymous"); w.Code != 200 {
			t.Fatalf("health: %d", w.Code)
		}
	}
}

func TestSetupAuthRouterRejectsCrossOriginSetup(t *testing.T) {
	s := newSetupAuthServer(t)
	s.cfg.BaseURL = "https://shortlink.example"
	h := s.Routes()
	for _, tc := range []struct{ origin, site string }{
		{"https://other.example", "cross-site"}, {"https://shortlink.example", "cross-site"},
		{"https://sibling.example", "same-site"}, {"null", ""}, {"http://shortlink.example", ""},
	} {
		for _, path := range []string{"/api/setup/test-db", "/api/setup/install"} {
			r := httptest.NewRequest("POST", path, strings.NewReader(`{"admin_email":"attacker@example.com"}`))
			r.SetBasicAuth("operator", "test-bootstrap-password-for-router")
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Sec-Fetch-Site", tc.site)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != 403 {
				t.Fatalf("cross-origin %s got %d", path, w.Code)
			}
		}
	}
	count, err := s.store().CountAdminAccounts(context.Background())
	if err != nil || count != 0 || s.isInstalled(context.Background()) {
		t.Fatal("cross-origin request changed installation")
	}
	for _, path := range []string{"/api/setup/test-db", "/api/setup/install"} {
		r := httptest.NewRequest("POST", path, strings.NewReader(`{"admin_email":"admin@example.com"}`))
		r.SetBasicAuth("operator", "test-bootstrap-password-for-router")
		r.Header.Set("Origin", "https://shortlink.example")
		r.Header.Set("Sec-Fetch-Site", "same-origin")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("same-origin %s got %d: %s", path, w.Code, w.Body.String())
		}
	}
}

func TestSetupAuthRouterPreservesPublicAndInstalledRoutes(t *testing.T) {
	fx := newAuthorizationFixture(t)
	fx.srv.cfg.VibeNestPilot = true
	fx.srv.cfg.SetupBootstrapUser = "operator"
	fx.srv.cfg.SetupBootstrapPassword = "test-bootstrap-password-for-router"
	ctx := context.Background()
	tenant, _, err := fx.st.EnsurePersonalTenant(ctx, fx.owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourceTenant(ctx, tenant.ID, fx.owner.ID, "short_link", fx.ownerShort.ID, "approve", "Test", false); err != nil {
		t.Fatal(err)
	}
	if err := fx.st.ReviewResourcePlatform(ctx, fx.admin.ID, "short_link", fx.ownerShort.ID, "approve", "Test", false); err != nil {
		t.Fatal(err)
	}
	h := fx.srv.Routes()
	for _, tc := range []struct {
		path   string
		status int
	}{{"/healthz", 200}, {"/login", 200}, {"/api/public/bootstrap", 200}, {"/s/owner-short", 302}, {"/owner-short", 302}, {"/qr/short/owner-short", 200}} {
		w := setupAuthRequest(h, "GET", tc.path, "", "anonymous")
		if w.Code != tc.status || w.Header().Get("WWW-Authenticate") != "" {
			t.Fatalf("public %s: %d, want %d; %s", tc.path, w.Code, tc.status, w.Body.String())
		}
		if tc.status == 302 && w.Header().Get("Location") != "https://example.com/owner-short" {
			t.Fatalf("redirect target: %s", w.Header().Get("Location"))
		}
		if tc.path == "/api/public/bootstrap" && strings.Contains(w.Body.String(), "test-bootstrap-password-for-router") {
			t.Fatal("public bootstrap leaked credential")
		}
	}
	w := authzRequest(t, h, "GET", "/admin", "", fx.adminCookies)
	if w.Code != 200 || w.Header().Get("WWW-Authenticate") != "" {
		t.Fatalf("installed admin session: %d", w.Code)
	}
	fx.srv.cfg.VibeNestPilot = false
	if w := setupAuthRequest(fx.srv.Routes(), "GET", "/setup", "", "anonymous"); w.Code != 302 {
		t.Fatalf("upstream opt-out: %d", w.Code)
	}
}
