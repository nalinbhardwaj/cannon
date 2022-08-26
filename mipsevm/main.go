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

	inpFileStub := "PM_CRYSTAL.inp"
	inpFile := fmt.Sprintf("%s/%s", basedir, inpFileStub)
	inpBytes, err := ioutil.ReadFile(inpFile)
	check(err)
	inpHash := crypto.Keccak256Hash(inpBytes)
	inpHashBytes := inpHash.Bytes()
	inpFileKey := fmt.Sprintf("%s/%s", basedir, inpHash)
	fmt.Printf("writing file %s\n", inpFileKey)
	ioutil.WriteFile(inpFileKey, inpBytes, 0644)
	savFileStub := "PM_CRYSTAL.sav"
	savFile := fmt.Sprintf("%s/%s", basedir, savFileStub)
	savBytes, err := ioutil.ReadFile(savFile)
	check(err)
	savHash := crypto.Keccak256Hash(savBytes)
	savHashBytes := savHash.Bytes()
	savFileKey := fmt.Sprintf("%s/%s", basedir, savHash)
	fmt.Printf("writing file %s\n", savFileKey)
	ioutil.WriteFile(savFileKey, savBytes, 0644)
	romFileStub := "PM_CRYSTAL.gbc"
	romFile := fmt.Sprintf("%s/%s", basedir, romFileStub)
	romBytes, err := ioutil.ReadFile(romFile)
	check(err)
	romHash := crypto.Keccak256Hash(romBytes)
	romHashBytes := romHash.Bytes()
	romFileKey := fmt.Sprintf("%s/%s", basedir, romHash)
	fmt.Printf("writing file %s\n", romFileKey)
	ioutil.WriteFile(romFileKey, romBytes, 0644)

	totalInpPreBytes := append(append(savHashBytes, inpHashBytes...), romHashBytes...)
	totalInpHash := crypto.Keccak256Hash(totalInpPreBytes)
	totalInpHashBytes := totalInpHash.Bytes()
	totalFileKey := fmt.Sprintf("%s/%s", basedir, totalInpHash)
	fmt.Printf("writing file %s\n", totalFileKey)
	ioutil.WriteFile(totalFileKey, totalInpPreBytes, 0644)

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
	if target_step < 0 {
		callback = nil
	}

	codeDat, err := ioutil.ReadFile(fn)
	check(err)
	codeLen := len(codeDat)

	mu := GetHookedUnicorn(basedir, uniram, callback, codeLen)

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
	LoadData(totalInpHashBytes, uniram, 0x30000000)
	mu.MemWrite(0x30000000, totalInpHashBytes)
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
		data := Hashes{fmt.Sprintf("%x", totalInpHash), fmt.Sprintf("%x", output_hash)}
		hashesFileKey := fmt.Sprintf("%s/hashes.json", basedir)
		b, _ := json.Marshal(data)
		ioutil.WriteFile(hashesFileKey, b, 0644)
	}
}
