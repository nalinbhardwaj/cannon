###############################################################################
# File         : add.asm
# Project      : MIPS32 MUX
# Author:      : Grant Ayers (ayers@cs.stanford.edu)
#
# Standards/Formatting:
#   MIPS gas, soft tab, 80 column
#
# Description:
#   Test the functionality of the 'add' instruction.
#
###############################################################################


    .section .test, "x"
    .balign 4
    .set    noreorder
    .global     
    .ent    test
test:
    lui     $s0, 0xbfff         # Load the base address 0xbffffff0
    ori     $s0, 0xfff0
    ori     $s1, $0, 1          # Prepare the 'done' status

    #### Test code start ####

    lui     $t0, 0x3100         # Load a valid address (last word in 2KB starting
    ori     $t0, 0x07fc         # from 0x3100007fc)
    lw      $v0, 0($t0)         # A = load(0xbfc00000-4)
    ori     $t1, $0, 0x3        # B = 0x3
    add     $v1, $v0, $t1       # C = A + B

    #### Test code end ####

    sw      $v1, 8($s0)         # Set the test result to C
    sw      $s1, 4($s0)         # Set 'done'

$done:
    jr      $ra
    nop

    .end test
