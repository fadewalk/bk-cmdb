package service

import "testing"

func TestStandaloneCloudEnabled(t *testing.T) {
	cases := []struct {
		name    string
		profile string
		want    bool
	}{
		{name: "unset keeps non-standalone behavior", profile: "", want: true},
		{name: "core disables cloud", profile: "core", want: false},
		{name: "cloud enables cloud", profile: "cloud", want: true},
		{name: "full enables cloud", profile: "full", want: true},
		{name: "sync keeps cloud disabled", profile: "sync", want: false},
		{name: "transfer keeps cloud disabled", profile: "transfer", want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("STANDALONE_PROFILE", tc.profile)
			if got := standaloneCloudEnabled(); got != tc.want {
				t.Fatalf("standaloneCloudEnabled() = %v, want %v", got, tc.want)
			}
		})
	}
}
