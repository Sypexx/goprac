package main

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
)

// encodeToken — создаёт простой токен: base64("user_id:username:role")
func encodeToken(id int64, name, role string) string {
	raw := fmt.Sprintf("%d:%s:%s", id, name, role)
	return base64.StdEncoding.EncodeToString([]byte(raw))
}

// decodeToken — разбирает токен обратно
func decodeToken(token string) (int64, string, string, error) {
	raw, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return 0, "", "", err
	}

	parts := strings.SplitN(string(raw), ":", 3)
	if len(parts) != 3 {
		return 0, "", "", fmt.Errorf("invalid token format")
	}

	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, "", "", err
	}

	return id, parts[1], parts[2], nil
}
