package ai

import (
	"errors"
	"fmt"
	"strings"
)

type AuthError struct {
	Provider   string
	StatusCode int
	Message    string
	RequestID  string
}

func (e *AuthError) Error() string {
	return formatProviderHTTPError(e.Provider, "auth", e.StatusCode, e.Message, e.RequestID)
}

type RateLimitError struct {
	Provider   string
	StatusCode int
	Message    string
	RetryAfter int
	RequestID  string
}

func (e *RateLimitError) Error() string {
	return formatProviderHTTPError(e.Provider, "rate limit", e.StatusCode, e.Message, e.RequestID)
}

type ServerError struct {
	Provider   string
	StatusCode int
	Message    string
	RequestID  string
}

func (e *ServerError) Error() string {
	return formatProviderHTTPError(e.Provider, "server", e.StatusCode, e.Message, e.RequestID)
}

func ClassifyHTTPError(provider string, statusCode int, body string) error {
	return ClassifyHTTPErrorWithRequestID(provider, statusCode, body, "")
}

func ClassifyHTTPErrorWithRequestID(provider string, statusCode int, body string, requestID string) error {
	message := normalizeHTTPErrorBody(body)
	requestID = normalizeRequestID(requestID)

	switch {
	case statusCode == 401 || statusCode == 403:
		return &AuthError{Provider: provider, StatusCode: statusCode, Message: message, RequestID: requestID}
	case statusCode == 429:
		return &RateLimitError{Provider: provider, StatusCode: statusCode, Message: message, RequestID: requestID}
	case statusCode >= 500 && statusCode < 600:
		return &ServerError{Provider: provider, StatusCode: statusCode, Message: message, RequestID: requestID}
	default:
		return fmt.Errorf("%s API error %s: %s", provider, formatHTTPStatus(statusCode, requestID), message)
	}
}

func normalizeHTTPErrorBody(body string) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return "empty response body"
	}
	return body
}

func normalizeRequestID(requestID string) string {
	requestID = strings.TrimSpace(requestID)
	requestID = strings.ReplaceAll(requestID, "\r", " ")
	requestID = strings.ReplaceAll(requestID, "\n", " ")
	return strings.Join(strings.Fields(requestID), " ")
}

func formatProviderHTTPError(provider string, kind string, statusCode int, message string, requestID string) string {
	return fmt.Sprintf("%s %s error %s: %s", provider, kind, formatHTTPStatus(statusCode, requestID), normalizeHTTPErrorBody(message))
}

func formatHTTPStatus(statusCode int, requestID string) string {
	if requestID == "" {
		return fmt.Sprintf("(%d)", statusCode)
	}
	return fmt.Sprintf("(%d, request_id=%s)", statusCode, requestID)
}

func IsRetryable(err error) bool {
	var rate *RateLimitError
	var server *ServerError
	return errors.As(err, &rate) || errors.As(err, &server)
}
