package setupauth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProtectSetupScope(t *testing.T) {
	paths := []string{"/setup", "/setup/", "/setup/unknown", "/api/setup", "/api/setup/", "/api/setup/test-db", "/api/setup/install", "/api/setup/future", "/x/../setup", "/api//setup/install", "/%73etup", "/api%2fsetup/install"}
	for _, p := range paths {
		for _, method := range []string{"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"} {
			for _, credential := range []string{"anonymous", "wrong-user", "wrong-password", "valid"} {
				t.Run(method+p+credential, func(t *testing.T) {
					called := false
					h := Protect(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { called = true; w.WriteHeader(204) }), true, "operator", "test-password-0123456789012345", "")
					r := httptest.NewRequest(method, p, nil)
					switch credential {
					case "wrong-user":
						r.SetBasicAuth("other", "test-password-0123456789012345")
					case "wrong-password":
						r.SetBasicAuth("operator", "wrong")
					case "valid":
						r.SetBasicAuth("operator", "test-password-0123456789012345")
					}
					w := httptest.NewRecorder()
					h.ServeHTTP(w, r)
					want := 401
					if credential == "valid" {
						want = 204
					}
					if w.Code != want || called != (want == 204) {
						t.Fatalf("status=%d handlerCalled=%v, want %d", w.Code, called, want)
					}
					if want == 401 && w.Header().Get("WWW-Authenticate") == "" {
						t.Fatal("missing Basic challenge")
					}
					if w.Header().Get("Cache-Control") != "no-store" {
						t.Fatal("setup response must not be cached")
					}
				})
			}
		}
	}
}

func TestProtectMissingCredentialsAndPublicRoutes(t *testing.T) {
	for _, credentials := range [][2]string{{"", "secret"}, {"user", ""}, {" ", "secret"}, {"user", " "}, {"invalid:user", "secret"}} {
		h := Protect(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }), true, credentials[0], credentials[1], "")
		for _, p := range []string{"/setup", "/api/setup/test-db", "/api/setup/install", "/api/setup/future"} {
			r := httptest.NewRequest("POST", p, nil)
			r.SetBasicAuth(credentials[0], credentials[1])
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != 503 {
				t.Fatalf("%s got %d, want 503", p, w.Code)
			}
		}
		for _, p := range []string{"/login", "/s/example", "/qr/short/example", "/api/public/bootstrap", "/assets/app.js", "/healthz", "/", "/setup-other"} {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest("GET", p, nil))
			if w.Code != 204 || w.Header().Get("WWW-Authenticate") != "" {
				t.Fatalf("public path %s was guarded", p)
			}
		}
	}
}

func TestProtectCredentialValidation(t *testing.T) {
	for _, pair := range [][2]string{{"operator", "12345678901234567890123"}, {"bad:user", "123456789012345678901234"}, {"bad\ruser", "123456789012345678901234"}, {"bad\nuser", "123456789012345678901234"}} {
		w := httptest.NewRecorder()
		Protect(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }), true, pair[0], pair[1], "").ServeHTTP(w, httptest.NewRequest("GET", "/setup", nil))
		if w.Code != 503 {
			t.Fatalf("invalid configuration got %d", w.Code)
		}
	}
}

func TestProtectCrossOriginMutations(t *testing.T) {
	h := Protect(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }), true, "operator", "123456789012345678901234", "https://shortlink.example")
	for _, tc := range []struct {
		origin, site string
		status       int
	}{
		{"", "", 204}, {"https://shortlink.example", "same-origin", 204},
		{"https://evil.example", "", 403}, {"https://shortlink.example", "cross-site", 403},
		{"", "same-site", 403}, {"null", "", 403}, {"http://shortlink.example", "", 403},
		{"https://shortlink.example.evil", "", 403}, {"https://shortlink.example:444", "", 403},
	} {
		for _, method := range []string{"POST", "PUT", "PATCH", "DELETE"} {
			r := httptest.NewRequest(method, "/api/setup/install", nil)
			r.SetBasicAuth("operator", "123456789012345678901234")
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if tc.site != "" {
				r.Header.Set("Sec-Fetch-Site", tc.site)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("%s origin=%q site=%q: %d, want %d", method, tc.origin, tc.site, w.Code, tc.status)
			}
		}
	}
}

func TestProtectOptOutAndMalformedAuthorization(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	w := httptest.NewRecorder()
	Protect(next, false, "", "", "").ServeHTTP(w, httptest.NewRequest("GET", "/setup", nil))
	if w.Code != 204 {
		t.Fatal("upstream opt-out changed")
	}
	for _, header := range []string{"Bearer secret", "Basic !!!", "Basic dXNlcg=="} {
		r := httptest.NewRequest("POST", "/api/setup/install", nil)
		r.Header.Set("Authorization", header)
		w := httptest.NewRecorder()
		Protect(next, true, "user", "secret-012345678901234567890123", "").ServeHTTP(w, r)
		if w.Code != 401 {
			t.Fatalf("malformed authorization got %d", w.Code)
		}
	}
}
