package authorization

import (
	"net/http"
	"testing"

	"configcenter/src/web_server/app/options"
)

func TestPermissionForPath(t *testing.T) {
	tests := []struct {
		method, path, object, action, domain string
	}{
		{http.MethodGet, "/api/v3/findmany/project", "instance", "read", "*"},
		{http.MethodPost, "/api/v3/table/biz/0", "biz", "create", "0"},
		{http.MethodDelete, "/api/v3/deletemany/project", "project", "delete", "*"},
	}
	for _, tt := range tests {
		object, action, domain, ok := PermissionForPath(tt.method, tt.path)
		if !ok || object != tt.object || action != tt.action || domain != tt.domain {
			t.Fatalf("PermissionForPath(%s,%s)=(%q,%q,%q,%v), want (%q,%q,%q,true)", tt.method, tt.path, object, action, domain, ok, tt.object, tt.action, tt.domain)
		}
	}
}

func TestAuthorizerBootstrapAdmin(t *testing.T) {
	a, err := New(options.Authorization{BootstrapUsers: []string{"alice"}})
	if err != nil {
		t.Fatal(err)
	}
	allowed, err := a.Enforce("alice", "2", "project", "delete")
	if err != nil || !allowed {
		t.Fatalf("bootstrap user not allowed: %v %v", allowed, err)
	}
	allowed, err = a.Enforce("bob", "2", "project", "delete")
	if err != nil {
		t.Fatal(err)
	}
	if allowed {
		t.Fatal("unbound user unexpectedly allowed")
	}
}
