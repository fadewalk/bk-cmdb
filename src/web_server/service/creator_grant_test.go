package service

import (
	"net/http"
	"testing"
)

func TestShouldCaptureCreatorPath(t *testing.T) {
	tests := []struct {
		method, path string
		want         bool
	}{
		{http.MethodPost, "/table/biz/0", true},
		{http.MethodPost, "/table/create/biz_set", true},
		{http.MethodPost, "/api/v3/create/biz_set", true},
		{http.MethodPost, "/api/v3/createmany/project", true},
		{http.MethodPut, "/table/biz/0/2", false},
		{http.MethodPost, "/api/v3/findmany/biz_set", false},
		{http.MethodPost, "/api/v3/create/instance/object/host", false},
		{http.MethodGet, "/table/create/biz_set", false},
	}
	for _, tt := range tests {
		if got := shouldCaptureCreatorPath(tt.method, tt.path); got != tt.want {
			t.Fatalf("shouldCaptureCreatorPath(%s,%s)=%v, want %v", tt.method, tt.path, got, tt.want)
		}
	}
}

func TestExtractCreatorResourceIDs(t *testing.T) {
	tests := []struct {
		name string
		body string
		want []string
	}{
		{
			name: "table create response",
			body: `{"result":true,"bk_error_code":0,"data":{"bk_biz_id":9,"bk_biz_name":"x"}}`,
			want: []string{"9"},
		},
		{
			name: "biz_set create response",
			body: `{"result":true,"data":{"bk_biz_set_id":12}}`,
			want: []string{"12"},
		},
		{
			name: "project createmany per-item response",
			body: `{"result":true,"data":[{"bk_project_id":21,"name":"a"},{"bk_project_id":22,"name":"b"}]}`,
			want: []string{"21", "22"},
		},
		{
			name: "string numeric ids accepted",
			body: `{"data":{"bk_biz_id":"33"}}`,
			want: []string{"33"},
		},
		{
			name: "non-positive and non-numeric ignored",
			body: `{"data":{"bk_biz_id":0,"bk_project_id":-3,"bk_biz_set_id":"abc"},"biz_id":7}`,
			want: []string{},
		},
		{
			name: "dedup across nesting",
			body: `{"data":{"bk_biz_id":44,"children":[{"bk_biz_id":44}]}}`,
			want: []string{"44"},
		},
		{
			name: "invalid json",
			body: `not-json`,
			want: nil,
		},
	}
	for _, tt := range tests {
		got := extractCreatorResourceIDs([]byte(tt.body))
		if len(got) != len(tt.want) {
			t.Fatalf("%s: got %v, want %v", tt.name, got, tt.want)
		}
		for i := range got {
			if got[i] != tt.want[i] {
				t.Fatalf("%s: got %v, want %v", tt.name, got, tt.want)
			}
		}
	}
}
