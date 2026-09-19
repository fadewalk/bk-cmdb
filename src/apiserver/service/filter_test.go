package service

import "testing"

func TestSelectServerEndpoint(t *testing.T) {
	tests := []struct {
		name    string
		kind    RequestType
		servers []string
		want    string
		wantErr bool
	}{
		{name: "empty discovery is a diagnostic error", kind: HostType, servers: nil, wantErr: true},
		{name: "http endpoint is selected", kind: TopoType, servers: []string{"http://127.0.0.1:60002"}, want: "http://127.0.0.1:60002"},
		{name: "https endpoint is selected", kind: ProcType, servers: []string{"https://proc.internal:60003"}, want: "https://proc.internal:60003"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := selectServerEndpoint(tc.kind, tc.servers)
			if (err != nil) != tc.wantErr {
				t.Fatalf("selectServerEndpoint() error = %v, wantErr %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Fatalf("selectServerEndpoint() = %q, want %q", got, tc.want)
			}
		})
	}
}
