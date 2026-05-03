package media

import (
	"strconv"
	"strings"
)

func QuoteLocation(path string) string {
	sanitized := strings.ReplaceAll(path, "\n", "")
	sanitized = strings.ReplaceAll(sanitized, "\r", "")
	return strconv.Quote(sanitized)
}

func Join(elems []string) string {
	return strings.Join(elems, " ")
}