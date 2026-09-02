package main

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

// loginHandler — проверка логина и выдача токена.
func loginHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req loginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}

		var user struct {
			ID       int64
			Name     string
			Password string
			Role     string
		}

		err := pool.QueryRow(r.Context(),
			`SELECT id, name, password, role FROM users WHERE name = $1`,
			req.Username).Scan(&user.ID, &user.Name, &user.Password, &user.Role)
		if err != nil {
			http.Error(w, `{"error":"not found"}`, http.StatusUnauthorized)
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
			http.Error(w, `{"error":"wrong password"}`, http.StatusUnauthorized)
			return
		}

		// Генерируем простой токен (в продакшене — JWT)
		token := generateToken(user.ID, user.Name, user.Role)

		json.NewEncoder(w).Encode(loginResponse{
			UserID:   user.ID,
			Username: user.Name,
			Role:     user.Role,
		})
		w.Header().Set("X-Auth-Token", token)
	}
}

// generateToken — простой токен: base64("user_id:username:role")
func generateToken(id int64, name, role string) string {
	return encodeToken(id, name, role)
}

// authMiddleware — проверка токена и установка UserID/Role в контекст.
func authMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := r.Header.Get("X-Auth-Token")
			if token == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			userId, name, role, err := decodeToken(token)
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			// Проверяем, что пользователь существует
			var exists bool
			pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, userId).Scan(&exists)
			if !exists {
				http.Error(w, `{"error":"user not found"}`, http.StatusUnauthorized)
				return
			}

			// Сохраняем в контекст
			ctx := r.Context()
			ctx = context.WithValue(ctx, "userId", userId)
			ctx = context.WithValue(ctx, "username", name)
			ctx = context.WithValue(ctx, "role", role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// requireRole — middleware для проверки роли.
func requireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, ok := r.Context().Value("role").(string)
			if !ok {
				http.Error(w, `{"error":"no role"}`, http.StatusUnauthorized)
				return
			}

			for _, allowed := range roles {
				if role == allowed {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		})
	}
}

// getUserId — извлекает userId из контекста.
func getUserId(r *http.Request) int64 {
	val := r.Context().Value("userId")
	if val == nil {
		return 0
	}
	return val.(int64)
}

// getRole — извлекает роль из контекста.
func getRole(r *http.Request) string {
	val := r.Context().Value("role")
	if val == nil {
		return ""
	}
	return val.(string)
}
