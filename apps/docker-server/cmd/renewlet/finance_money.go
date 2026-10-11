package main

import (
	"errors"
	"math/big"
	"regexp"
	"strings"
)

// Amounts are stored as decimal strings. Aggregates use arbitrary precision so
// neither large histories nor a negative opening balance can overflow int64.
var financeAmountPattern = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$`)
var financeCurrencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

// Match JavaScript/Zod string lengths, including supplementary characters.
func financeTextFits(value string, max int) bool {
	length := 0
	for _, char := range value {
		length++
		if char > 0xffff {
			length++
		}
		if length > max {
			return false
		}
	}
	return true
}

func financeUnits(value string, signed bool) (*big.Int, error) {
	if len(value) > 24 || !financeAmountPattern.MatchString(value) || (!signed && strings.HasPrefix(value, "-")) {
		return nil, errors.New("INVALID_AMOUNT")
	}
	negative := strings.HasPrefix(value, "-")
	parts := strings.Split(strings.TrimPrefix(value, "-"), ".")
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	units, ok := new(big.Int).SetString(parts[0]+fraction+strings.Repeat("0", 6-len(fraction)), 10)
	if !ok || units.Cmp(big.NewInt(maxMoneyUnits)) > 0 {
		return nil, errors.New("INVALID_AMOUNT")
	}
	if negative {
		units.Neg(units)
	}
	return units, nil
}

func financeDecimal(units *big.Int) string {
	negative := units.Sign() < 0
	digits := new(big.Int).Abs(units).String()
	if len(digits) < 7 {
		digits = strings.Repeat("0", 7-len(digits)) + digits
	}
	value := digits[:len(digits)-6]
	fraction := strings.TrimRight(digits[len(digits)-6:], "0")
	if fraction != "" {
		value += "." + fraction
	}
	if negative {
		value = "-" + value
	}
	return value
}
