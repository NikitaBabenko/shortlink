package config

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestPilotFlagFailsClosed(t *testing.T) {
	for value, want := range map[string]bool{"": false, "false": false, "0": false, "true": true, "1": true, "tru": true} {
		if got := pilotModeEnabled(value); got != want {
			t.Errorf("%q = %v, want %v", value, got, want)
		}
	}
}

func TestPilotCredentialsEnvOnly(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DATA_DIR", dir)
	t.Setenv("APP_SECRET", "test-app-secret")
	t.Setenv("VIBENEST_PILOT", "true")
	t.Setenv("SETUP_BOOTSTRAP_USER", "test-operator")
	t.Setenv("SETUP_BOOTSTRAP_PASSWORD", "test-bootstrap-password-for-router")
	c := Load()
	if !c.VibeNestPilot || c.SetupBootstrapUser != "test-operator" || c.SetupBootstrapPassword != "test-bootstrap-password-for-router" {
		t.Fatal("bootstrap ENV not loaded")
	}
	if err := SaveRuntime(dir, c.RuntimeConfig()); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(RuntimePath(dir))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(c)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{c.SetupBootstrapUser, c.SetupBootstrapPassword} {
		if strings.Contains(string(b), secret) || strings.Contains(string(encoded), secret) {
			t.Fatal("bootstrap credential serialized")
		}
	}
	t.Setenv("SETUP_BOOTSTRAP_USER", "")
	t.Setenv("SETUP_BOOTSTRAP_PASSWORD", "")
	c = Load()
	if !c.VibeNestPilot || c.SetupBootstrapUser != "" || c.SetupBootstrapPassword != "" {
		t.Fatal("credentials were restored outside ENV")
	}
}
