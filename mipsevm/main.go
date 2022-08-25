package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"strconv"

	"github.com/ethereum/go-ethereum/crypto"
	uc "github.com/unicorn-engine/unicorn/bindings/go/unicorn"
)

func WriteCheckpoint(ram map[uint32](uint32), fn string, step int) {
	trieroot := RamToTrie(ram)
	dat := TrieToJson(trieroot, step)
	fmt.Printf("writing %s len %d with root %s\n", fn, len(dat), trieroot)
	ioutil.WriteFile(fn, dat, 0644)
}

func i64tob(val uint64) []byte {
	r := make([]byte, 8)
	for i := uint64(0); i < 8; i++ {
		r[i] = byte((val >> (i * 8)) & 0xff)
	}
	return r
}

func i32tobrev(val uint32) []byte {
	r := make([]byte, 4)
	for i := uint32(0); i < 4; i++ {
		r[3 - i] = byte((val >> (8 * i)) & 0xff)
	}
	return r
}

type Hashes struct {
	InputHash string
	OutputHash string
}

func main() {
	basedir := os.Getenv("BASEDIR")
	if len(basedir) == 0 {
		basedir = "tmp/cannon/minime"
	}
	target_step_str := os.Getenv("TARGET_STEP")
	if len(target_step_str) == 0 {
		target_step_str = "-1"
	}
	target_step, _ := strconv.Atoi(target_step_str)
	fmt.Printf("target_step %d\n", target_step)

	fn := "mipigo/minime.bin"

	inputFileStub := "input"
	if len(os.Args) > 1 {
		inputFileStub = os.Args[1]
	}
	inputFile := fmt.Sprintf("%s/%s", basedir, inputFileStub)


	uniram := make(map[uint32](uint32))
	lastStep := 1

	callback := func(step int, mu uc.Unicorn, ram map[uint32](uint32)) {
		// SyncRegs(mu, ram) // not needed until writes
		if target_step >= 0 && step == target_step {
			SyncRegs(mu, uniram)
			WriteCheckpoint(uniram, fmt.Sprintf("%s/checkpoint-%s.json", basedir, target_step_str), step)	
			mu.RegWrite(uc.MIPS_REG_PC, 0x5ead0004)
		}
		lastStep = step + 1
	}

	mu := GetHookedUnicorn(basedir, uniram, callback)

	// loop forever to match EVM
	//mu.MemMap(0x5ead0000, 0x1000)
	//mu.MemWrite(0xdead0000, []byte{0x08, 0x10, 0x00, 0x00})
	// mu.MemWrite(0xbfc007fc, []byte{0x00, 0x00, 0x00, 0x08});

	// load into ram
	ZeroRegisters(uniram)
	LoadMappedFileUnicorn(mu, fn, uniram, 0)
	WriteCheckpoint(uniram, fmt.Sprintf("%s/golden.json", basedir), -1)

	// inputs
	// inputs, err := ioutil.ReadFile(fmt.Sprintf("%s/input", root))
	// check(err)
	inputBytes, err := ioutil.ReadFile(inputFile)
	check(err)
	// fmt.Printf("%x\n", inputBytes)
	inputHash := crypto.Keccak256Hash(inputBytes)
	inputHashBytes := inputHash.Bytes()
	fileKey := fmt.Sprintf("%s/%s", basedir, inputHash)
	fmt.Printf("writing file %s\n", fileKey)
	ioutil.WriteFile(fileKey, inputBytes, 0644)
	LoadData(inputHashBytes, uniram, 0x30000000)
	mu.MemWrite(0x30000000, inputHashBytes)
	SyncRegs(mu, uniram)

	mu.Start(0, 0x5ead0004)

	if target_step == -1 {
		output, _ := mu.MemRead(0x30000800, 0x24)
		magic_number := output[0:0x4]
		output_hash := output[0x4:0x24]
		fmt.Printf("output: %x\n", output)
		fmt.Printf("magic number: %x\n", magic_number)
		fmt.Printf("output hash: %x\n", output_hash)
		SyncRegs(mu, uniram)
		WriteCheckpoint(uniram, fmt.Sprintf("%s/final.json", basedir), lastStep)
		data := Hashes{fmt.Sprintf("%x", inputHash), fmt.Sprintf("%x", output_hash)}
		hashesFileKey := fmt.Sprintf("%s/hashes.json", basedir)
		b, _ := json.Marshal(data)
		ioutil.WriteFile(hashesFileKey, b, 0644)
	}
}
