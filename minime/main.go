package main

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/oracle"
)

func i64tob(val uint64) []byte {
	r := make([]byte, 8)
	for i := uint64(0); i < 8; i++ {
		r[i] = byte((val >> (i * 8)) & 0xff)
	}
	return r
}

func VDF(x *big.Int) *big.Int {
	ROUNDS := 100
	PRIME, ok := common.ParseBig256("28948022309329048855892746252171976963363056481941560715954676764349967630337")
	if !ok {
		panic("parse error")
	}
	POWER, ok := common.ParseBig256("23158417847463239084714197001737581570690445185553317903743794198714690358477")
	if !ok {
		panic("parse error")
	}
	y := crypto.Keccak256Hash(x.Bytes())
	for i := 0;i < ROUNDS;i++ {
		x_next := common.ModExp(x + y, POWER, PRIME)
		y_next := x
		x, y = x_next, y_next
	}
	return x
}

func main() {
	inputHash := oracle.InputHash()
	fmt.Println("inputHash:", inputHash)
	inputPreimageBytes := oracle.Preimage(inputHash)
	inputPreimage := common.BytesToHash(inputPreimageBytes)
	input := inputPreimage.Big().Uint64()
	fmt.Println(input)
	output := input + 1
	fmt.Println(output)
	oracle.OutputBytes(i64tob(output))
}
