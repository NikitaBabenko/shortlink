// Package setupauth restricts the installer without changing public app routes.
package setupauth

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"net/url"
	"path"
	"strings"
	"unicode/utf8"
)

// Protect requires operator-provided Basic credentials on every setup route in
// pilot mode. Credentials are environment-only and must be transported over HTTPS.
func Protect(next http.Handler, enabled bool, username, password, publicBaseURL string) http.Handler {
	userHash := sha256.Sum256([]byte(username))
	passwordHash := sha256.Sum256([]byte(password))
	configured := strings.TrimSpace(username) != "" && utf8.RuneCountInString(strings.TrimSpace(password)) >= 24 && !strings.ContainsAny(username, ":\r\n")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// URL.Path is decoded; clean it before ServeMux canonicalizes dot segments.
		p := path.Clean("/" + r.URL.Path)
		setup := p == "/setup" || strings.HasPrefix(p, "/setup/") || p == "/api/setup" || strings.HasPrefix(p, "/api/setup/")
		if !enabled || !setup {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if !configured {
			http.Error(w, "Setup is unavailable: bootstrap credentials are not configured.", http.StatusServiceUnavailable)
			return
		}
		u, pword, ok := r.BasicAuth()
		providedUser := sha256.Sum256([]byte(u))
		providedPassword := sha256.Sum256([]byte(pword))
		// Hashing fixes comparison lengths; evaluate both comparisons every time.
		valid := subtle.ConstantTimeCompare(providedUser[:], userHash[:]) & subtle.ConstantTimeCompare(providedPassword[:], passwordHash[:])
		if !ok || valid != 1 {
			w.Header().Set("WWW-Authenticate", `Basic realm="Shortlink setup", charset="UTF-8"`)
			http.Error(w, "Setup authentication required.", http.StatusUnauthorized)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions && !sameOrigin(r, publicBaseURL) {
			http.Error(w, "Cross-origin setup requests are not allowed.", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Basic credentials may be sent automatically by a browser. Reject cross-site
// mutations even when that browser already authenticated to the installer.
func sameOrigin(r *http.Request, publicBaseURL string) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
		return false
	}
	origins := r.Header.Values("Origin")
	if len(origins) == 0 {
		return true
	} // Non-browser operator clients.
	if len(origins) != 1 {
		return false
	}
	origin, err := url.Parse(origins[0])
	if err != nil || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return false
	}
	scheme, host := "http", r.Host
	if r.TLS != nil {
		scheme = "https"
	}
	if publicBaseURL != "" {
		base, err := url.Parse(publicBaseURL)
		if err != nil || base.Host == "" || (base.Scheme != "http" && base.Scheme != "https") {
			return false
		}
		scheme, host = base.Scheme, base.Host
	}
	return origin.Scheme == scheme && strings.EqualFold(origin.Host, host)
}
