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
9343  .byte $C9, $8C, $D0, $2B, $A0, $00, $84, $2A
934B  .byte $AD, $CE, $03, $85, $2B, $AD, $CD, $03
9353  .byte $C9, $FF, $F0, $01, $98, $91, $2A, $C8
935B  .byte $D0, $FB, $E6, $2B, $A5, $2B, $38, $ED
9363  .byte $CE, $03, $C9, $20, $D0, $E7, $84, $24
936B  .byte $84, $25, $18, $90, $6C
9370  BEQ $93DE
9372  .byte $A5, $25, $4A, $29, $03, $0D, $CE, $03
937A  .byte $85, $2B, $A5, $25, $6A, $08, $0A, $29
9382  .byte $18, $85, $2A, $0A, $0A, $05, $2A, $0A
938A  .byte $28, $6A, $18, $65, $24, $85, $2A, $68
9392  .byte $2D, $CF, $03, $48, $AD, $CC, $03, $4A
939A  .byte $4A, $4A, $85, $27, $68, $48, $2A, $26
93A2  .byte $27, $2A, $26, $27, $2A, $26, $27, $29
93AA  .byte $F8, $85, $26, $A0, $00, $B1, $26, $84
93B2  .byte $4F, $A0, $00, $48, $AD, $CD, $03, $F0
93BA  .byte $06, $C9, $FF, $F0, $02, $B1, $2A, $91
93C2  .byte $2A, $68, $51, $2A, $91, $2A, $A4, $4F
93CA  .byte $A5, $2B, $18, $69, $04, $85, $2B, $C8
93D2  .byte $C0, $08, $D0, $D9, $E6, $24, $A5, $24
93DA  .byte $C5, $21, $90, $10
93DE  LDA WNDLFT
93E0  STA CH
93E2  INC CV
93E4  LDA CV
93E6  CMP WNDBTM
93E8  BCC $93EE
93EA  .byte $A5, $22, $85, $25
93EE  LDY $4E
93F0  PLA
93F1  RTS
93F2  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF
93FA  .byte $FF, $FF, $FF, $FF, $FF, $FF
