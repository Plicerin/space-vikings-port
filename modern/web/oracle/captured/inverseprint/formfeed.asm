9300  .byte $48, $20, $58, $FF, $86, $4E, $BA, $BD
9308  .byte $00, $01, $85, $37, $A9, $3C, $85, $36
9310  .byte $A6, $4E, $8D, $57, $C0, $8D, $52, $C0
9318  .byte $8D, $55, $C0, $A5, $E6, $C9, $40, $F0
9320  .byte $05, $A9, $20, $8D, $54, $C0, $8D, $CE
9328  .byte $03, $8D, $50, $C0, $A9, $00, $8D, $CD
9330  .byte $03, $A9, $7F, $8D, $CF, $03, $A9, $68
9338  .byte $8D, $CC, $03, $68
933C  PHA
933D  STY $4E
933F  CMP #$8D
9341  BEQ $9370
9343  CMP #$8C
9345  BNE $9372
9347  LDY #$00
9349  STY $2A
934B  LDA FLAG974
934E  STA $2B
9350  LDA INVFLAG
9353  CMP #$FF
9355  BEQ $9358
9357  .byte $98
9358  STA ($2A),Y
935A  INY
935B  BNE $9358
935D  INC $2B
935F  LDA $2B
9361  SEC
9362  SBC FLAG974
9365  CMP #$20
9367  BNE $9350
9369  STY CH
936B  STY CV
936D  CLC
936E  BCC $93DC
9370  .byte $F0, $6C, $A5, $25, $4A, $29, $03, $0D
9378  .byte $CE, $03, $85, $2B, $A5, $25, $6A, $08
9380  .byte $0A, $29, $18, $85, $2A, $0A, $0A, $05
9388  .byte $2A, $0A, $28, $6A, $18, $65, $24, $85
9390  .byte $2A, $68, $2D, $CF, $03, $48, $AD, $CC
9398  .byte $03, $4A, $4A, $4A, $85, $27, $68, $48
93A0  .byte $2A, $26, $27, $2A, $26, $27, $2A, $26
93A8  .byte $27, $29, $F8, $85, $26, $A0, $00, $B1
93B0  .byte $26, $84, $4F, $A0, $00, $48, $AD, $CD
93B8  .byte $03, $F0, $06, $C9, $FF, $F0, $02, $B1
93C0  .byte $2A, $91, $2A, $68, $51, $2A, $91, $2A
93C8  .byte $A4, $4F, $A5, $2B, $18, $69, $04, $85
93D0  .byte $2B, $C8, $C0, $08, $D0, $D9, $E6, $24
93D8  .byte $A5, $24, $C5, $21
93DC  BCC $93EE
93DE  .byte $A5, $20, $85, $24, $E6, $25, $A5, $25
93E6  .byte $C5, $23, $90, $04, $A5, $22, $85, $25
93EE  LDY $4E
93F0  PLA
93F1  RTS
93F2  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF
93FA  .byte $FF, $FF, $FF, $FF, $FF, $FF
