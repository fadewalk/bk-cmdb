package metadata

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/x/bsonx/bsoncore"
)

func TestHostMapStrAcceptsStringAndArrayIPFields(t *testing.T) {
	tests := []struct {
		name  string
		value interface{}
		want  string
	}{
		{name: "legacy string", value: "10.0.0.1", want: "10.0.0.1"},
		{name: "current string array", value: []string{"10.0.0.1", "10.0.0.2"}, want: "10.0.0.1,10.0.0.2"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc, err := bson.Marshal(bson.M{"bk_host_innerip": tt.value})
			if err != nil {
				t.Fatalf("marshal host document: %v", err)
			}
			var host HostMapStr
			if err := host.UnmarshalBSON(doc); err != nil {
				t.Fatalf("unmarshal host document: %v", err)
			}
			if got := host["bk_host_innerip"]; got != tt.want {
				t.Fatalf("inner ip = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestParseBsonStringArrayValueToStringRejectsNonStringArrayValues(t *testing.T) {
	// mongo-driver v1.17:AppendArrayElement 收编码值字节;单元素 int32 文档用 AppendInt32Element 构造
	doc := bsoncore.BuildDocument(nil, bsoncore.AppendInt32Element(nil, "0", 1))
	value := bsoncore.Document(doc).Lookup("0")
	if _, err := parseBsonStringArrayValueToString(value); err == nil {
		t.Fatal("expected non-string array value to fail")
	}
}
