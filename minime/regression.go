package main

// func i64tob(val uint64) []byte {
// 	r := make([]byte, 8)
// 	for i := uint64(0); i < 8; i++ {
// 		r[i] = byte((val >> (i * 8)) & 0xff)
// 	}
// 	return r
// }

// func main() {
// 	inputHash := oracle.InputHash()
// 	fmt.Println("inputHash:", inputHash)
// 	inputPreimageBytes := oracle.Preimage(inputHash)
// 	inputPreimage := common.BytesToHash(inputPreimageBytes)
// 	input := inputPreimage.Big().Uint64()
// 	fmt.Println(input)
// 	output := input + 1
// 	fmt.Println(output)
// 	oracle.OutputBytes(i64tob(output))
// }
