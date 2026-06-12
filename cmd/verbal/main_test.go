package main

import (
	"testing"
)

func TestSmokeCheckArg(t *testing.T) {
	if smokeCheckArg != "--smoke-check" {
		t.Errorf("smokeCheckArg = %q, want %q", smokeCheckArg, "--smoke-check")
	}
}
