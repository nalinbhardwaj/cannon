package main

import (
	"fmt"
	"sync"
	"testing"
	"time"

	uc "github.com/unicorn-engine/unicorn/bindings/go/unicorn"
)

func TestCompareUnicornEvm(t *testing.T) {
	// fn := "../mipigo/test/test.bin"
	fn := "../mipigo/minime.bin"

	var done sync.Mutex
	RegSerialize := func(ram map[uint32](uint32)) []uint32 {
		ret := []uint32{ram[0xc0000080], uint32(len(ram))}
		// 36 registers, 32 basic + pc + hi/lo + heap
		for i := uint32(0xc0000000); i < 0xc0000000+36*4; i += 4 {
			ret = append(ret, ram[i])
		}
		return ret
	}

	steps := 2000000
	//steps := 1165
	//steps := 1180
	//steps := 24

	// cevm := make(chan []uint32, 1)
	cuni := make(chan []uint32, 1)

	// evmram := make(map[uint32](uint32))
	// LoadMappedFile(fn, evmram, 0)
	// // not for test.bin
	// /*inputFile := fmt.Sprintf("/tmp/cannon/%d_%d/input", 0, 13284469)
	// LoadMappedFile(inputFile, evmram, 0x30000000)*/
	// // init registers to 0 in evm
	// for i := uint32(0xC0000000); i < 0xC0000000+36*4; i += 4 {
	// 	WriteRam(evmram, i, 0)
	// }

	// go RunWithRam(evmram, steps, 0, "", func(step int, ram map[uint32](uint32)) {
	// 	fmt.Printf("lol %d evm %x\n", step, ram[0xc0000080])
	// 	cevm <- RegSerialize(ram)
	// 	done.Lock()
	// 	done.Unlock()
	// })

	uniram := make(map[uint32](uint32))
	// ministart := time.Now()
	go RunUnicorn(fn, uniram, true, func(step int, mu uc.Unicorn, ram map[uint32](uint32)) {
		SyncRegs(mu, ram)
		cuni <- RegSerialize(ram)
		done.Lock()
		done.Unlock()
		// if step%1000000 == 0 {
		// 	steps_per_sec := float64(step) * 1e9 / float64(time.Now().Sub(ministart).Nanoseconds())
		// 	fmt.Printf("%10d pc: %x steps per s %f ram entries %d\n", step, ram[0xc0000080], steps_per_sec, len(ram))
		// }
		// fmt.Println("cuni", step, ram, cuni);
		// // halt at steps
		// if step == steps {
		// 	mu.RegWrite(uc.MIPS_REG_PC, 0x5ead0004)
		// }
	})

	for i := 0; i < steps; i++ {
		x := <-cuni
		if x[0] == 0x5ead0000 {
			fmt.Printf("both processes exited %d", i)
			break
		}
	}

	// sleep
	done.Lock()
	time.Sleep(1000 * time.Millisecond)

	// final ram check
	// for k, v := range uniram {
	// 	fmt.Printf("ram at %x is %x\n", k, v)
	// }
}
