package main

import (
	"fmt"

	"github.com/ethereum/go-ethereum/oracle"
)

func i64tob(val uint64) []byte {
	r := make([]byte, 8)
	for i := uint64(0); i < 8; i++ {
		r[i] = byte((val >> (i * 8)) & 0xff)
	}
	return r
}

func main() {
	inputHash := oracle.InputHash()
	fmt.Println("inputHash:", inputHash)
	inputPreimageBytes := oracle.Preimage(inputHash)
	input, err := loadWord2Vec(inputPreimageBytes)
	if err != nil {
		panic(err)
	}
	fmt.Println(len(input.words))
	output := i64tob(72)
	fmt.Println(output)
	oracle.OutputBytes(output)
}
