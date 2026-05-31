package auth

import "testing"

func TestHashPasswordAndCheck(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !CheckPassword(hash, "correct horse battery") {
		t.Fatal("expected password to match hash")
	}
	if CheckPassword(hash, "wrong password") {
		t.Fatal("expected wrong password to fail")
	}
}

func TestHashPasswordUniqueSalts(t *testing.T) {
	h1, err := HashPassword("same-password")
	if err != nil {
		t.Fatal(err)
	}
	h2, err := HashPassword("same-password")
	if err != nil {
		t.Fatal(err)
	}
	if h1 == h2 {
		t.Fatal("bcrypt hashes should differ due to random salt")
	}
}
