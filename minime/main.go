package main

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
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
	ROUNDS := 1
	PRIME, ok := math.ParseBig256("28948022309329048855892746252171976963363056481941560715954676764349967630337")
	if !ok {
		panic("parse error")
	}
	POWER, ok := math.ParseBig256("23158417847463239084714197001737581570690445185553317903743794198714690358477")
	if !ok {
		panic("parse error")
	}
	y := crypto.Keccak256Hash(x.Bytes()).Big()
	for i := 0;i < ROUNDS;i++ {
		x_next := math.ModExp(x.Add(x, y), POWER, PRIME)
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
	input := inputPreimage.Big()
	fmt.Println(input)
	output := VDF(input)
	fmt.Println(output)
	oracle.OutputBytes(output.Bytes())
}
