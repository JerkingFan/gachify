package lyrics

import "testing"

func TestParseLRC(t *testing.T) {
	doc := ParseLRC("[00:12.50]Hello ♂️ world\n[00:15.00]Second line")
	if len(doc.Lines) != 2 {
		t.Fatalf("lines: %d", len(doc.Lines))
	}
	if doc.Lines[0].StartMs != 12500 || doc.Lines[0].Text != "Hello ♂️ world" {
		t.Fatalf("first: %+v", doc.Lines[0])
	}
	if ActiveLine(doc, 16000) != 1 {
		t.Fatalf("active at 16s: %d", ActiveLine(doc, 16000))
	}
}
