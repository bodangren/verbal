package ai

import (
	"errors"
	"fmt"
)

type AuthError struct {
	Provider   string
	StatusCode int
	Message    string
}

func (e *AuthError) Error() string {
	return fmt.Sprintf("%s auth error (%d): %s", e.Provider, e.StatusCode, e.Message)
}

type RateLimitError struct {
	Provider   string
	StatusCode int
	Message    string
	RetryAfter int
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("%s rate limit error (%d): %s", e.Provider, e.StatusCode, e.Message)
}

type ServerError struct {
	Provider   string
	StatusCode int
	Message    string
}

func (e *ServerError) Error() string {
	return fmt.Sprintf("%s server error (%d): %s", e.Provider, e.StatusCode, e.Message)
}

func ClassifyHTTPError(provider string, statusCode int, body string) error {
	switch {
	case statusCode == 401 || statusCode == 403:
		return &AuthError{Provider: provider, StatusCode: statusCode, Message: body}
	case statusCode == 429:
		return &RateLimitError{Provider: provider, StatusCode: statusCode, Message: body}
	case statusCode >= 500 && statusCode < 600:
		return &ServerError{Provider: provider, StatusCode: statusCode, Message: body}
	default:
		return fmt.Errorf("%s API error (%d): %s", provider, statusCode, body)
	}
}

func IsRetryable(err error) bool {
	var rate *RateLimitError
	var server *ServerError
	return errors.As(err, &rate) || errors.As(err, &server)
}
