; SPACE SIMULATOR ASSEMBLY, BLOADed to $9023 by START line 110.
; STARSHIP SIMULATOR line 150 calls it as CALL CA, CA = 36899 = $9023.
;
; 1,279,509 instructions were traced during flight;
; 77 of them were inside this routine, touching
; 39 of its 597 bytes, over 2 passes of the main loop.
;
; Code below is found by following the routine from its entry points, not by
; decoding straight through - bytes nothing can reach are left as data. A line
; marked * was additionally seen executing on the real machine; an unmarked
; instruction is on a path the paddles did not select during the trace.
;
; call/jump targets inside the routine: $9032 x1, $903F x1, $904C x1, $9059 x1, $905F x2, $9088 x8, $9093 x1, $90A0 x1, $90AD x1, $90BA x1, $90C0 x1, $90E9 x8, $90F2 x1, $910A x1, $9117 x2, $9118 x2, $9128 x1, $912E x1, $9140 x1, $9161 x4, $9162 x1, $918B x4, $918C x4, $919A x1, $919E x4, $91AC x1, $91B3 x4, $91C1 x1, $91C5 x4, $91D3 x1, $91D7 x4, $91E5 x1, $91EC x4, $91FA x1, $91FE x1, $920D x2, $920E x1, $921D x2, $921E x1
;
* $9023  18                       CLC
* $9024  AD FD 95                 LDA $95FD
* $9027  C9 AA                    CMP #$AA
* $9029  B0 34                    BCS $905F
* $902B  C9 5A                    CMP #$5A
* $902D  90 03                    BCC $9032
* $902F  4C 5F 90                 JMP $905F
  $9032  20 C5 91                 JSR $91C5
  $9035  AD FD 95                 LDA $95FD
  $9038  C9 46                    CMP #$46
  $903A  90 03                    BCC $903F
  $903C  4C 88 90                 JMP $9088
  $903F  20 C5 91                 JSR $91C5
  $9042  AD FD 95                 LDA $95FD
  $9045  C9 32                    CMP #$32
  $9047  90 03                    BCC $904C
  $9049  4C 88 90                 JMP $9088
  $904C  20 C5 91                 JSR $91C5
  $904F  AD FD 95                 LDA $95FD
  $9052  C9 1F                    CMP #$1F
  $9054  90 03                    BCC $9059
  $9056  4C 88 90                 JMP $9088
  $9059  20 C5 91                 JSR $91C5
  $905C  4C 88 90                 JMP $9088
* $905F  18                       CLC
* $9060  AD FD 95                 LDA $95FD
* $9063  C9 AA                    CMP #$AA
* $9065  90 21                    BCC $9088
  $9067  20 8C 91                 JSR $918C
  $906A  AD FD 95                 LDA $95FD
  $906D  C9 BE                    CMP #$BE
  $906F  90 17                    BCC $9088
  $9071  20 8C 91                 JSR $918C
  $9074  AD FD 95                 LDA $95FD
  $9077  C9 D2                    CMP #$D2
  $9079  90 0D                    BCC $9088
  $907B  20 8C 91                 JSR $918C
  $907E  AD FD 95                 LDA $95FD
  $9081  C9 E6                    CMP #$E6
  $9083  90 03                    BCC $9088
  $9085  20 8C 91                 JSR $918C
* $9088  18                       CLC
* $9089  AD FE 95                 LDA $95FE
* $908C  C9 5A                    CMP #$5A
* $908E  90 03                    BCC $9093
* $9090  4C C0 90                 JMP $90C0
  $9093  20 D7 91                 JSR $91D7
  $9096  AD FE 95                 LDA $95FE
  $9099  C9 46                    CMP #$46
  $909B  90 03                    BCC $90A0
  $909D  4C E9 90                 JMP $90E9
  $90A0  20 D7 91                 JSR $91D7
  $90A3  AD FE 95                 LDA $95FE
  $90A6  C9 32                    CMP #$32
  $90A8  90 03                    BCC $90AD
  $90AA  4C E9 90                 JMP $90E9
  $90AD  20 D7 91                 JSR $91D7
  $90B0  AD FE 95                 LDA $95FE
  $90B3  C9 1E                    CMP #$1E
  $90B5  90 03                    BCC $90BA
  $90B7  4C E9 90                 JMP $90E9
  $90BA  20 D7 91                 JSR $91D7
  $90BD  4C E9 90                 JMP $90E9
* $90C0  18                       CLC
* $90C1  AD FE 95                 LDA $95FE
* $90C4  C9 AA                    CMP #$AA
* $90C6  90 21                    BCC $90E9
  $90C8  20 9E 91                 JSR $919E
  $90CB  AD FE 95                 LDA $95FE
  $90CE  C9 BE                    CMP #$BE
  $90D0  90 17                    BCC $90E9
  $90D2  20 9E 91                 JSR $919E
  $90D5  AD FE 95                 LDA $95FE
  $90D8  C9 D2                    CMP #$D2
  $90DA  90 0D                    BCC $90E9
  $90DC  20 9E 91                 JSR $919E
  $90DF  AD FE 95                 LDA $95FE
  $90E2  C9 E6                    CMP #$E6
  $90E4  90 03                    BCC $90E9
  $90E6  20 9E 91                 JSR $919E
* $90E9  20 F2 90                 JSR $90F2
* $90EC  20 2E 91                 JSR $912E
* $90EF  4C 1E 92                 JMP $921E
* $90F2  18                       CLC
* $90F3  AD 21 73                 LDA PITCH
* $90F6  C9 40                    CMP #$40
* $90F8  90 1E                    BCC $9118
  $90FA  C9 C0                    CMP #$C0
  $90FC  B0 1A                    BCS $9118
  $90FE  AD 2F 95                 LDA $952F
  $9101  C9 01                    CMP #$01
  $9103  F0 12                    BEQ $9117
  $9105  A9 01                    LDA #$01
  $9107  8D 2F 95                 STA $952F
  $910A  18                       CLC
  $910B  AD 23 73                 LDA HEADING
  $910E  C9 7F                    CMP #$7F
  $9110  90 16                    BCC $9128
  $9112  E9 7F                    SBC #$7F
  $9114  8D 23 73                 STA HEADING
* $9117  60                       RTS
* $9118  18                       CLC
* $9119  AD 2F 95                 LDA $952F
* $911C  C9 00                    CMP #$00
* $911E  F0 F7                    BEQ $9117
  $9120  A9 00                    LDA #$00
  $9122  8D 2F 95                 STA $952F
  $9125  4C 0A 91                 JMP $910A
  $9128  69 7E                    ADC #$7E
  $912A  8D 23 73                 STA HEADING
  $912D  60                       RTS
* $912E  18                       CLC
* $912F  AD 22 73                 LDA BANK
* $9132  C9 05                    CMP #$05
* $9134  90 2B                    BCC $9161
  $9136  AD 22 73                 LDA BANK
  $9139  C9 31                    CMP #$31
  $913B  90 03                    BCC $9140
  $913D  4C 62 91                 JMP $9162
  $9140  20 B3 91                 JSR $91B3
  $9143  AD 22 73                 LDA BANK
  $9146  C9 11                    CMP #$11
  $9148  90 17                    BCC $9161
  $914A  20 B3 91                 JSR $91B3
  $914D  AD 22 73                 LDA BANK
  $9150  C9 21                    CMP #$21
  $9152  90 0D                    BCC $9161
  $9154  20 B3 91                 JSR $91B3
  $9157  AD 22 73                 LDA BANK
  $915A  C9 30                    CMP #$30
  $915C  90 03                    BCC $9161
  $915E  20 B3 91                 JSR $91B3
* $9161  60                       RTS
  $9162  18                       CLC
  $9163  AD 22 73                 LDA BANK
  $9166  C9 FB                    CMP #$FB
  $9168  B0 21                    BCS $918B
  $916A  20 EC 91                 JSR $91EC
  $916D  AD 22 73                 LDA BANK
  $9170  C9 F0                    CMP #$F0
  $9172  B0 17                    BCS $918B
  $9174  20 EC 91                 JSR $91EC
  $9177  AD 22 73                 LDA BANK
  $917A  C9 E0                    CMP #$E0
  $917C  B0 0D                    BCS $918B
  $917E  20 EC 91                 JSR $91EC
  $9181  AD 22 73                 LDA BANK
  $9184  C9 D0                    CMP #$D0
  $9186  B0 03                    BCS $918B
  $9188  20 EC 91                 JSR $91EC
  $918B  60                       RTS
  $918C  18                       CLC
  $918D  AD 21 73                 LDA PITCH
  $9190  C9 00                    CMP #$00
  $9192  D0 06                    BNE $919A
  $9194  A9 FF                    LDA #$FF
  $9196  8D 21 73                 STA PITCH
  $9199  60                       RTS
  $919A  CE 21 73                 DEC PITCH
  $919D  60                       RTS
  $919E  18                       CLC
  $919F  AD 22 73                 LDA BANK
  $91A2  C9 00                    CMP #$00
  $91A4  D0 06                    BNE $91AC
  $91A6  A9 FF                    LDA #$FF
  $91A8  8D 22 73                 STA BANK
  $91AB  60                       RTS
  $91AC  CE 22 73                 DEC BANK
  $91AF  20 0E 92                 JSR $920E
  $91B2  60                       RTS
  $91B3  18                       CLC
  $91B4  AD 23 73                 LDA HEADING
  $91B7  C9 00                    CMP #$00
  $91B9  D0 06                    BNE $91C1
  $91BB  A9 FF                    LDA #$FF
  $91BD  8D 23 73                 STA HEADING
  $91C0  60                       RTS
  $91C1  CE 23 73                 DEC HEADING
  $91C4  60                       RTS
  $91C5  18                       CLC
  $91C6  AD 21 73                 LDA PITCH
  $91C9  C9 FF                    CMP #$FF
  $91CB  D0 06                    BNE $91D3
  $91CD  A9 00                    LDA #$00
  $91CF  8D 21 73                 STA PITCH
  $91D2  60                       RTS
  $91D3  EE 21 73                 INC PITCH
  $91D6  60                       RTS
  $91D7  18                       CLC
  $91D8  AD 22 73                 LDA BANK
  $91DB  C9 FF                    CMP #$FF
  $91DD  D0 06                    BNE $91E5
  $91DF  A9 00                    LDA #$00
  $91E1  8D 22 73                 STA BANK
  $91E4  60                       RTS
  $91E5  EE 22 73                 INC BANK
  $91E8  20 FE 91                 JSR $91FE
  $91EB  60                       RTS
  $91EC  18                       CLC
  $91ED  AD 23 73                 LDA HEADING
  $91F0  C9 FF                    CMP #$FF
  $91F2  D0 06                    BNE $91FA
  $91F4  A9 00                    LDA #$00
  $91F6  8D 23 73                 STA HEADING
  $91F9  60                       RTS
  $91FA  EE 23 73                 INC HEADING
  $91FD  60                       RTS
  $91FE  18                       CLC
  $91FF  AD 22 73                 LDA BANK
  $9202  C9 30                    CMP #$30
  $9204  90 07                    BCC $920D
  $9206  C9 D0                    CMP #$D0
  $9208  B0 03                    BCS $920D
  $920A  CE 22 73                 DEC BANK
  $920D  60                       RTS
  $920E  18                       CLC
  $920F  AD 22 73                 LDA BANK
  $9212  C9 D0                    CMP #$D0
  $9214  B0 07                    BCS $921D
  $9216  C9 30                    CMP #$30
  $9218  90 03                    BCC $921D
  $921A  EE 22 73                 INC BANK
  $921D  60                       RTS
* $921E  20 00 60                 JSR $6000
* $9221  60                       RTS
  $9222  C1 34 00 1B 0A 42 04 4F  .byte $C1, $34, $00, $1B, $0A, $42, $04, $4F   ;  TO 4...B.O
  $922A  28 49 29 D0 E6 28 EA 28  .byte $28, $49, $29, $D0, $E6, $28, $EA, $28   ; (I) =  ASC ( MID$ (
  $9232  4E 24 2C 4A 2C 31 29 29  .byte $4E, $24, $2C, $4A, $2C, $31, $29, $29   ; N$,J,1))
  $923A  C9 34 38 00 33 0A 4C 04  .byte $C9, $34, $38, $00, $33, $0A, $4C, $04   ;  - 48.3.L.
  $9242  AD 4F 28 49 29 CF 39 C4  .byte $AD, $4F, $28, $49, $29, $CF, $39, $C4   ;  IF O(I) > 9 THEN 
  $924A  4F 28 49 29 D0 4F 28 49  .byte $4F, $28, $49, $29, $D0, $4F, $28, $49   ; O(I) = O(I
  $9252  29 C9 37 00 3D 0A 56 04  .byte $29, $C9, $37, $00, $3D, $0A, $56, $04   ; ) - 7.=.V.
  $925A  4A D0 4A C8 31 00 44 0A  .byte $4A, $D0, $4A, $C8, $31, $00, $44, $0A   ; J = J + 1.D.
  $9262  60 04 82 49 00 6A 0A 6A  .byte $60, $04, $82, $49, $00, $6A, $0A, $6A   ; `. NEXT I.j.j
  $926A  04 4F D0 34 30 39 36 CA  .byte $04, $4F, $D0, $34, $30, $39, $36, $CA   ; .O = 4096 * 
  $9272  4F 28 31 29 38 EE        .byte $4F, $28, $31, $29, $38, $EE   ; O(1)8.
