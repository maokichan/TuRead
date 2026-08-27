package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// 识别协议枚举
const (
	ProtocolISBN        = "isbn"
	ProtocolASIN        = "asin"
	ProtocolDOI         = "doi"
	ProtocolOpenLibrary = "open-library"
	ProtocolContentHash = "content-hash-v1" // 非标出版物兜底：标题+作者归一化哈希
)

var knownProtocols = map[string]bool{
	ProtocolISBN:        true,
	ProtocolASIN:        true,
	ProtocolDOI:         true,
	ProtocolOpenLibrary: true,
	ProtocolContentHash: true,
}

// ValidProtocol 协议是否在枚举内
func ValidProtocol(p string) bool {
	return knownProtocols[p]
}

// NormalizeCode 归一化识别编码并校验（isbn 去分隔符 + 校验位；其余只做格式校验）
func NormalizeCode(protocol, code string) (string, bool) {
	switch protocol {
	case ProtocolISBN:
		c := stripNonAlnum(code)
		switch len(c) {
		case 10:
			return strings.ToUpper(c), validISBN10(strings.ToUpper(c))
		case 13:
			return c, validISBN13(c)
		}
		return c, false
	case ProtocolASIN:
		c := strings.ToUpper(strings.TrimSpace(code))
		return c, len(c) == 10
	case ProtocolDOI:
		c := strings.TrimSpace(code)
		return c, strings.HasPrefix(c, "10.")
	case ProtocolOpenLibrary:
		c := strings.TrimSpace(code)
		return c, strings.HasPrefix(c, "OL")
	case ProtocolContentHash:
		return strings.TrimSpace(code), len(code) > 0
	}
	return "", false
}

// ContentHashCode 非标出版物：标题+作者归一化后哈希作为识别编码
func ContentHashCode(title, author string) string {
	normalized := strings.ToLower(strings.TrimSpace(title)) + "\x00" + strings.ToLower(strings.TrimSpace(author))
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

func stripNonAlnum(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == 'X' || r == 'x' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// validISBN10 ISBN-10 校验位：sum(d_i * (10-i)) % 11 == 0
func validISBN10(s string) bool {
	if len(s) != 10 {
		return false
	}
	sum := 0
	for i := 0; i < 10; i++ {
		c := s[i]
		var d int
		if c == 'X' || c == 'x' {
			if i != 9 {
				return false
			}
			d = 10
		} else if c >= '0' && c <= '9' {
			d = int(c - '0')
		} else {
			return false
		}
		sum += d * (10 - i)
	}
	return sum%11 == 0
}

// validISBN13 ISBN-13 校验位：sum(d_i * (1 或 3)) % 10 == 0
func validISBN13(s string) bool {
	if len(s) != 13 {
		return false
	}
	sum := 0
	for i := 0; i < 13; i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return false
		}
		d := int(c - '0')
		if i%2 == 0 {
			sum += d
		} else {
			sum += d * 3
		}
	}
	return sum%10 == 0
}
