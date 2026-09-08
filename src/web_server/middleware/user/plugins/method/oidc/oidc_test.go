package oidc

import (
	"testing"
	"time"
)

func TestPKCEVerifier(t *testing.T) {
	verifier, challenge, err := PKCEVerifier()
	if err != nil {
		t.Fatal(err)
	}
	if verifier == "" || challenge == "" || verifier == challenge {
		t.Fatal("invalid PKCE pair")
	}
}

func TestStateExpired(t *testing.T) {
	if StateExpired(time.Now(), time.Minute) {
		t.Fatal("fresh state considered expired")
	}
	if !StateExpired(time.Now().Add(-2*time.Minute), time.Minute) {
		t.Fatal("expired state considered valid")
	}
}
