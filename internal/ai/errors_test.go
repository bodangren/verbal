package ai

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestAuthError_Type(t *testing.T) {
	err := &AuthError{Provider: "OpenAI", StatusCode: 401, Message: "invalid api key"}
	var target *AuthError
	if !errors.As(err, &target) {
		t.Error("AuthError should match errors.As")
	}
	if err.Error() == "" {
		t.Error("AuthError.Error() should not be empty")
	}
	if err.Provider != "OpenAI" {
		t.Errorf("expected provider OpenAI, got %s", err.Provider)
	}
	if err.StatusCode != 401 {
		t.Errorf("expected status 401, got %d", err.StatusCode)
	}
}

func TestRateLimitError_Type(t *testing.T) {
	err := &RateLimitError{Provider: "Google", StatusCode: 429, Message: "rate limit exceeded", RetryAfter: 30}
	var target *RateLimitError
	if !errors.As(err, &target) {
		t.Error("RateLimitError should match errors.As")
	}
	if err.Error() == "" {
		t.Error("RateLimitError.Error() should not be empty")
	}
	if err.RetryAfter != 30 {
		t.Errorf("expected RetryAfter 30, got %d", err.RetryAfter)
	}
}

func TestServerError_Type(t *testing.T) {
	err := &ServerError{Provider: "OpenAI", StatusCode: 500, Message: "internal error"}
	var target *ServerError
	if !errors.As(err, &target) {
		t.Error("ServerError should match errors.As")
	}
	if err.Error() == "" {
		t.Error("ServerError.Error() should not be empty")
	}
}

func TestServerError_IncludesRequestID(t *testing.T) {
	err := &ServerError{
		Provider:   "OpenAI",
		StatusCode: 500,
		Message:    "empty response body",
		RequestID:  "req_test_123",
	}
	msg := err.Error()
	if !strings.Contains(msg, "request_id=req_test_123") {
		t.Fatalf("expected request ID in error, got %q", msg)
	}
	if !strings.Contains(msg, "empty response body") {
		t.Fatalf("expected body placeholder in error, got %q", msg)
	}
}

func TestErrorTypeDiscrimination(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		isAuth   bool
		isRate   bool
		isServer bool
	}{
		{
			name: "auth error", err: &AuthError{Provider: "OpenAI", StatusCode: 401, Message: "bad key"},
			isAuth: true,
		},
		{
			name: "rate limit error", err: &RateLimitError{Provider: "Google", StatusCode: 429, Message: "slow down"},
			isRate: true,
		},
		{
			name: "server error", err: &ServerError{Provider: "OpenAI", StatusCode: 502, Message: "bad gateway"},
			isServer: true,
		},
		{
			name: "generic error", err: fmt.Errorf("something else"),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var auth *AuthError
			var rate *RateLimitError
			var server *ServerError

			if errors.As(tc.err, &auth) != tc.isAuth {
				t.Errorf("errors.As(*AuthError) = %v, want %v", !tc.isAuth, tc.isAuth)
			}
			if errors.As(tc.err, &rate) != tc.isRate {
				t.Errorf("errors.As(*RateLimitError) = %v, want %v", !tc.isRate, tc.isRate)
			}
			if errors.As(tc.err, &server) != tc.isServer {
				t.Errorf("errors.As(*ServerError) = %v, want %v", !tc.isServer, tc.isServer)
			}
		})
	}
}

func TestClassifyHTTPError(t *testing.T) {
	tests := []struct {
		name       string
		provider   string
		statusCode int
		body       string
		wantType   string
	}{
		{"401 is AuthError", "OpenAI", 401, "unauthorized", "AuthError"},
		{"403 is AuthError", "Google", 403, "forbidden", "AuthError"},
		{"429 is RateLimitError", "OpenAI", 429, "rate limited", "RateLimitError"},
		{"500 is ServerError", "Google", 500, "internal error", "ServerError"},
		{"502 is ServerError", "OpenAI", 502, "bad gateway", "ServerError"},
		{"503 is ServerError", "Google", 503, "unavailable", "ServerError"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ClassifyHTTPError(tt.provider, tt.statusCode, tt.body)
			switch tt.wantType {
			case "AuthError":
				var e *AuthError
				if !errors.As(err, &e) {
					t.Errorf("expected AuthError, got %T: %v", err, err)
				}
			case "RateLimitError":
				var e *RateLimitError
				if !errors.As(err, &e) {
					t.Errorf("expected RateLimitError, got %T: %v", err, err)
				}
			case "ServerError":
				var e *ServerError
				if !errors.As(err, &e) {
					t.Errorf("expected ServerError, got %T: %v", err, err)
				}
			}
		})
	}
}

func TestClassifyHTTPError_Unrecognized(t *testing.T) {
	err := ClassifyHTTPError("Test", http.StatusBadRequest, "bad request")
	if err == nil {
		t.Error("expected non-nil error for unrecognized status code")
	}
	var auth *AuthError
	var rate *RateLimitError
	var server *ServerError
	if errors.As(err, &auth) || errors.As(err, &rate) || errors.As(err, &server) {
		t.Error("unrecognized status code should return generic error")
	}
}

func TestClassifyHTTPErrorWithRequestID_EmptyBody(t *testing.T) {
	err := ClassifyHTTPErrorWithRequestID("OpenAI", http.StatusInternalServerError, " \n\t ", "req_empty_body")
	var serverErr *ServerError
	if !errors.As(err, &serverErr) {
		t.Fatalf("expected ServerError, got %T: %v", err, err)
	}
	if serverErr.Message != "empty response body" {
		t.Fatalf("Message = %q, want empty response body", serverErr.Message)
	}
	if serverErr.RequestID != "req_empty_body" {
		t.Fatalf("RequestID = %q, want req_empty_body", serverErr.RequestID)
	}
}

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name      string
		err       error
		retryable bool
	}{
		{"rate limit is retryable", &RateLimitError{Provider: "OpenAI", StatusCode: 429}, true},
		{"server error is retryable", &ServerError{Provider: "OpenAI", StatusCode: 500}, true},
		{"auth error not retryable", &AuthError{Provider: "OpenAI", StatusCode: 401}, false},
		{"generic error not retryable", fmt.Errorf("generic"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsRetryable(tt.err)
			if got != tt.retryable {
				t.Errorf("IsRetryable() = %v, want %v", got, tt.retryable)
			}
		})
	}
}
