package domain

import (
	"strings"
)

// 识别协议枚举
const (
	ProtocolISBN        = "isbn"
	ProtocolASIN        = "asin"
	ProtocolDOI         = "doi"
	ProtocolOpenLibrary = "open-library"
	// content-hash-v1：无外部标识符（ISBN/ASIN/DOI/OL）书籍的兜底身份。
	// 语义（2026-08-27 重定义）：edition 内容指纹 —— 由客户端校准算法计算（同一扫描版/同一文件内容 → 同 code，
	// 标题/文件名不同不影响；扫描版不同就是不同 edition，位置无法对齐即不同身份）。server 只存不重算（不透明字符串）。
	ProtocolContentHash = "content-hash-v1"
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

// ContentHashCode 已移除（2026-08-27）：原为"标题+作者归一化哈希"的参考实现。
// content-hash-v1 现定义为 edition 内容指纹，由客户端校准算法计算（见 ProtocolContentHash 注释），server 不再提供参考实现。

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
