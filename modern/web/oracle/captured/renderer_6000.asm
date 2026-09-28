; LO-HI A2-3D1 - the renderer. BLOADed to $6000 by START line 90, 4864 bytes.
; $9023 (the flight controls) hands off to it at $921E: JSR $6000.
; CSN and SN, the cosine and sine STARSHIP SIMULATOR calls, are at $6006/$6009.
;
; 2008 of 4864 bytes are reachable code by traversal from the entry
; points; 1483 were additionally seen executing and are marked *.
; Unreachable bytes are left as data rather than decoded.
;
; most-called targets: $635C x21, $633D x18, $620F x10, $6FE6 x6, $6E95 x6, $6468 x6, $6848 x5, $6162 x4, $6DB5 x4, $62C5 x4, $64FB x4, $64F8 x4, $68A1 x4, $62C3 x3
;
* $6000  4C 1C 61                 JMP $611C
  $6003  4C 40 61                 .byte $4C, $40, $61   ; L@a
* $6006  4C 26 65                 JMP $6526
* $6009  4C 3F 65                 JMP $653F
  $600C  00 00 00 63 FF 7F FF 7F  .byte $00, $00, $00, $63, $FF, $7F, $FF, $7F   ; ...c....
  $6014  F0 A0 FF FF FF FF FF 01  .byte $F0, $A0, $FF, $FF, $FF, $FF, $FF, $01   ; . COLOR= ......
  $601C  08 03 08 03 08 03 08 00  .byte $08, $03, $08, $03, $08, $03, $08, $00   ; ........
  $6024  96 13 1D 00 96 00 FF 00  .byte $96, $13, $1D, $00, $96, $00, $FF, $00   ;  HTAB ... HTAB ...
  $602C  00 00 00 00 00 00 08 00  .byte $00, $00, $00, $00, $00, $00, $08, $00   ; ........
  $6034  00 44 80 95 09 A3 09 FF  .byte $00, $44, $80, $95, $09, $A3, $09, $FF   ; .D END  XDRAW . HIMEM: ..
  $603C  08 00 FF FF AA 09 FF 03  .byte $08, $00, $FF, $FF, $AA, $09, $FF, $03   ; .... LET ...
  $6044  4C E5 00 FF B6 08 AF 08  .byte $4C, $E5, $00, $FF, $B6, $08, $AF, $08   ; L VAL .. LOAD . & .
  $604C  FF 00 00 00 00 88 FF FF  .byte $FF, $00, $00, $00, $00, $88, $FF, $FF   ; ..... GR ..
  $6054  FF 69 FF 00 00 D0 D1 09  .byte $FF, $69, $FF, $00, $00, $D0, $D1, $09   ; .i... =  < .
  $605C  55 00 00 00 00 09 09 03  .byte $55, $00, $00, $00, $00, $09, $09, $03   ; U.......
  $6064  08 E6 B8 D0 02 E6 B9 AD  .byte $08, $E6, $B8, $D0, $02, $E6, $B9, $AD   ; . ASC  DEF  = . ASC  POKE  IF 
  $606C  05 02 C9 3A B0 0A C9 20  .byte $05, $02, $C9, $3A, $B0, $0A, $C9, $20   ; .. - : GOSUB . -  
  $6074  F0 EF 2E 62 B7 61 EC 61  .byte $F0, $EF, $2E, $62, $B7, $61, $EC, $61   ; ...b SAVE a.a
  $607C  12 62 BE 62 CB 62 DC 62  .byte $12, $62, $BE, $62, $CB, $62, $DC, $62   ; .b GET b / b LOG b
  $6084  ED 62 44 6D 48 71 FA 62  .byte $ED, $62, $44, $6D, $48, $71, $FA, $62   ; .bDmHq.b
  $608C  0B 63 8A 71 19 63 EA 68  .byte $0B, $63, $8A, $71, $19, $63, $EA, $68   ; .c PR# q.c MID$ h
  $6094  0F 69 2A 63 38 63 FF 7F  .byte $0F, $69, $2A, $63, $38, $63, $FF, $7F   ; .i*c8c..
  $609C  F5 7F D7 7F A6 7F 61 7F  .byte $F5, $7F, $D7, $7F, $A6, $7F, $61, $7F   ; .. SCRN( . RESUME .a.
  $60A4  09 7F 9C 7E 1C 7E 89 7D  .byte $09, $7F, $9C, $7E, $1C, $7E, $89, $7D   ; .. NOTRACE ~.~ TEXT }
  $60AC  E3 7C 29 7C 5C 7B 7C 7A  .byte $E3, $7C, $29, $7C, $5C, $7B, $7C, $7A   ;  LEN |)|\{|z
  $60B4  89 79 83 78 6B 77 40 76  .byte $89, $79, $83, $78, $6B, $77, $40, $76   ;  TEXT y DATA xkw@v
  $60BC  03 75 B5 73 54 72 E1 70  .byte $03, $75, $B5, $73, $54, $72, $E1, $70   ; .u WAIT sTr ATN p
  $60C4  5E 6F C9 6D 23 6C 6C 6A  .byte $5E, $6F, $C9, $6D, $23, $6C, $6C, $6A   ; ^o - m#llj
  $60CC  79 67 CE 66 E7 64 F1 62  .byte $79, $67, $CE, $66, $E7, $64, $F1, $62   ; yg OR f CHR$ d.b
  $60D4  EB 60 D6 5E B3 5C 81 5A  .byte $EB, $60, $D6, $5E, $B3, $5C, $81, $5A   ; .` FRE ^ STOP \ FOR Z
  $60DC  42 58 F4 55 9A 53 33 51  .byte $42, $58, $F4, $55, $9A, $53, $33, $51   ; BX.U SHLOAD S3Q
  $60E4  BF 4E 3F 4C B3 49 1C 47  .byte $BF, $4E, $3F, $4C, $B3, $49, $1C, $47   ;  NEW N?L STOP I.G
  $60EC  7A 44 CD 41 16 3F 56 3C  .byte $7A, $44, $CD, $41, $16, $3F, $56, $3C   ; zD AND A.?V<
  $60F4  8C 39 B9 36 DE 33 FB 30  .byte $8C, $39, $B9, $36, $DE, $33, $FB, $30   ;  CALL 9 POKE 6 COS 3.0
  $60FC  10 2E 1F 2B 26 28 27 25  .byte $10, $2E, $1F, $2B, $26, $28, $27, $25   ; ...+&('%
  $6104  23 22 19 1F 0B 1C F9 18  .byte $23, $22, $19, $1F, $0B, $1C, $F9, $18   ; #"......
  $610C  E1 15 C7 12 AB 0F 8C 0C  .byte $E1, $15, $C7, $12, $AB, $0F, $8C, $0C   ;  ATN . STEP . GOTO . CALL .
  $6114  6A 09 47 06 24 03 00 00  .byte $6A, $09, $47, $06, $24, $03, $00, $00   ; j.G.$...
* $611C  08                       PHP
* $611D  48                       PHA
* $611E  8A                       TXA
* $611F  48                       PHA
* $6120  98                       TYA
* $6121  48                       PHA
* $6122  A2 62                    LDX #$62
* $6124  B5 5F                    LDA $5F,X
* $6126  9D 13 60                 STA $6013,X
* $6129  CA                       DEX
* $612A  D0 F8                    BNE $6124
* $612C  20 40 61                 JSR $6140
* $612F  A2 62                    LDX #$62
* $6131  BD 13 60                 LDA $6013,X
* $6134  95 5F                    STA $5F,X
* $6136  CA                       DEX
* $6137  D0 F8                    BNE $6131
* $6139  68                       PLA
* $613A  A8                       TAY
* $613B  68                       PLA
* $613C  AA                       TAX
* $613D  68                       PLA
* $613E  28                       PLP
* $613F  60                       RTS
* $6140  D8                       CLD
* $6141  A2 21                    LDX #$21
* $6143  A9 00                    LDA #$00
* $6145  95 7B                    STA $7B,X
* $6147  CA                       DEX
* $6148  D0 FB                    BNE $6145
* $614A  A9 73                    LDA #$73
* $614C  85 9C                    STA $9C
* $614E  A9 FD                    LDA #$FD
* $6150  85 7E                    STA $7E
* $6152  85 86                    STA $86
* $6154  85 8E                    STA $8E
* $6156  A9 7F                    LDA #$7F
* $6158  85 7F                    STA $7F
* $615A  85 87                    STA $87
* $615C  85 8F                    STA $8F
* $615E  A9 0A                    LDA #$0A
* $6160  85 B1                    STA $B1
* $6162  A0 00                    LDY #$00
* $6164  B1 9B                    LDA ($9B),Y
* $6166  30 04                    BMI $616C
* $6168  C9 12                    CMP #$12
* $616A  30 09                    BMI $6175
* $616C  A5 7D                    LDA $7D
* $616E  F0 04                    BEQ $6174
  $6170  A9 79                    LDA #$79
  $6172  91 9D                    STA ($9D),Y
* $6174  60                       RTS
* $6175  0A                       ASL A
* $6176  AA                       TAX
* $6177  BD 76 60                 LDA $6076,X
* $617A  85 A3                    STA $A3
* $617C  BD 77 60                 LDA $6077,X
* $617F  85 A4                    STA $A4
* $6181  6C A3 00                 JMP ($00A3)
* $6184  18                       CLC
* $6185  65 9B                    ADC $9B
* $6187  85 9B                    STA $9B
* $6189  90 02                    BCC $618D
* $618B  E6 9C                    INC $9C
* $618D  60                       RTS
* $618E  A0 68                    LDY #$68
* $6190  20 2B 67                 JSR $672B
* $6193  20 48 68                 JSR $6848
* $6196  A2 07                    LDX #$07
* $6198  B5 67                    LDA $67,X
* $619A  95 6F                    STA $6F,X
* $619C  CA                       DEX
* $619D  D0 F9                    BNE $6198
* $619F  A9 07                    LDA #$07
* $61A1  20 84 61                 JSR $6184
* $61A4  A5 66                    LDA $66
* $61A6  25 6E                    AND $6E
* $61A8  60                       RTS
* $61A9  A0 60                    LDY #$60
* $61AB  20 2B 67                 JSR $672B
* $61AE  20 EF 67                 JSR $67EF
* $61B1  A9 07                    LDA #$07
* $61B3  20 84 61                 JSR $6184
* $61B6  60                       RTS
* $61B7  20 A9 61                 JSR $61A9
* $61BA  20 8E 61                 JSR $618E
* $61BD  D0 50                    BNE $620F
* $61BF  A5 66                    LDA $66
* $61C1  D0 14                    BNE $61D7
* $61C3  A5 6E                    LDA $6E
* $61C5  D0 03                    BNE $61CA
* $61C7  4C 7A 62                 JMP $627A
  $61CA  A5 7C                    LDA $7C
  $61CC  D0 41                    BNE $620F
  $61CE  20 79 69                 JSR $6979
  $61D1  C6 B1                    DEC $B1
  $61D3  F0 3A                    BEQ $620F
  $61D5  D0 EC                    BNE $61C3
  $61D7  A5 7C                    LDA $7C
  $61D9  D0 34                    BNE $620F
  $61DB  20 5F 69                 JSR $695F
  $61DE  A5 66                    LDA $66
  $61E0  F0 E1                    BEQ $61C3
  $61E2  25 6E                    AND $6E
  $61E4  D0 29                    BNE $620F
  $61E6  C6 B1                    DEC $B1
  $61E8  D0 F1                    BNE $61DB
  $61EA  F0 23                    BEQ $620F
* $61EC  A2 07                    LDX #$07
* $61EE  B5 6F                    LDA $6F,X
* $61F0  95 5F                    STA $5F,X
* $61F2  CA                       DEX
* $61F3  D0 F9                    BNE $61EE
* $61F5  20 8E 61                 JSR $618E
* $61F8  D0 15                    BNE $620F
* $61FA  A5 66                    LDA $66
* $61FC  D0 D9                    BNE $61D7
* $61FE  A5 6E                    LDA $6E
* $6200  F0 63                    BEQ $6265
  $6202  A5 7C                    LDA $7C
  $6204  D0 09                    BNE $620F
  $6206  20 79 69                 JSR $6979
  $6209  C6 B1                    DEC $B1
  $620B  F0 02                    BEQ $620F
  $620D  D0 EF                    BNE $61FE
  $620F  4C 5E 61                 JMP $615E
* $6212  A2 07                    LDX #$07
* $6214  B5 6F                    LDA $6F,X
* $6216  95 67                    STA $67,X
* $6218  CA                       DEX
* $6219  D0 F9                    BNE $6214
* $621B  20 A9 61                 JSR $61A9
* $621E  A5 66                    LDA $66
* $6220  25 6E                    AND $6E
* $6222  D0 EB                    BNE $620F
* $6224  A5 66                    LDA $66
* $6226  D0 AF                    BNE $61D7
* $6228  A5 6E                    LDA $6E
* $622A  D0 9E                    BNE $61CA
* $622C  F0 42                    BEQ $6270
* $622E  20 A9 61                 JSR $61A9
* $6231  A5 66                    LDA $66
* $6233  F0 03                    BEQ $6238
* $6235  4C 62 61                 JMP $6162
* $6238  A0 60                    LDY #$60
* $623A  A2 9F                    LDX #$9F
* $623C  20 A1 68                 JSR $68A1
* $623F  A5 7D                    LDA $7D
* $6241  30 0E                    BMI $6251
* $6243  A5 9F                    LDA $9F
* $6245  A6 A0                    LDX $A0
* $6247  85 B3                    STA $B3
* $6249  86 B4                    STX $B4
* $624B  20 8F 6D                 JSR $6D8F
* $624E  4C 62 61                 JMP $6162
  $6251  A9 0A                    LDA #$0A
  $6253  A0 00                    LDY #$00
  $6255  91 9D                    STA ($9D),Y
  $6257  C8                       INY
  $6258  A5 9F                    LDA $9F
  $625A  91 9D                    STA ($9D),Y
  $625C  C8                       INY
  $625D  A5 A0                    LDA $A0
  $625F  91 9D                    STA ($9D),Y
  $6261  A9 03                    LDA #$03
  $6263  10 4D                    BPL $62B2
* $6265  A5 A1                    LDA $A1
* $6267  A6 A2                    LDX $A2
* $6269  85 9F                    STA $9F
* $626B  86 A0                    STX $A0
* $626D  4C 81 62                 JMP $6281
* $6270  A0 60                    LDY #$60
* $6272  A2 9F                    LDX #$9F
* $6274  20 A1 68                 JSR $68A1
* $6277  4C 88 62                 JMP $6288
* $627A  A0 60                    LDY #$60
* $627C  A2 9F                    LDX #$9F
* $627E  20 A1 68                 JSR $68A1
* $6281  A0 68                    LDY #$68
* $6283  A2 A1                    LDX #$A1
* $6285  20 A1 68                 JSR $68A1
* $6288  A5 7D                    LDA $7D
* $628A  D0 16                    BNE $62A2
* $628C  A5 9F                    LDA $9F
* $628E  A6 A0                    LDX $A0
* $6290  85 B3                    STA $B3
* $6292  86 B4                    STX $B4
* $6294  A5 A1                    LDA $A1
* $6296  A6 A2                    LDX $A2
* $6298  85 B5                    STA $B5
* $629A  86 B6                    STX $B6
* $629C  20 D5 6D                 JSR $6DD5
* $629F  4C 5E 61                 JMP $615E
  $62A2  A9 06                    LDA #$06
  $62A4  A0 00                    LDY #$00
  $62A6  91 9D                    STA ($9D),Y
  $62A8  B9 9F 00                 LDA $009F,Y
  $62AB  C8                       INY
  $62AC  C0 05                    CPY #$05
  $62AE  D0 F6                    BNE $62A6
  $62B0  A9 05                    LDA #$05
  $62B2  18                       CLC
  $62B3  65 9D                    ADC $9D
  $62B5  85 9D                    STA $9D
  $62B7  90 02                    BCC $62BB
  $62B9  E6 9E                    INC $9E
  $62BB  4C 5E 61                 JMP $615E
* $62BE  C8                       INY
* $62BF  B1 9B                    LDA ($9B),Y
* $62C1  85 7C                    STA $7C
* $62C3  A9 02                    LDA #$02
* $62C5  20 84 61                 JSR $6184
* $62C8  4C 62 61                 JMP $6162
* $62CB  C8                       INY
* $62CC  B1 9B                    LDA ($9B),Y
* $62CE  99 8F 00                 STA $008F,Y
* $62D1  C0 09                    CPY #$09
* $62D3  D0 F6                    BNE $62CB
* $62D5  20 4E 65                 JSR $654E
* $62D8  A9 0A                    LDA #$0A
* $62DA  D0 E9                    BNE $62C5
  $62DC  C8                       INY
  $62DD  B1 9B                    LDA ($9B),Y
  $62DF  99 B2 00                 STA $00B2,Y
  $62E2  C0 04                    CPY #$04
  $62E4  D0 F6                    BNE $62DC
  $62E6  20 D5 6D                 JSR $6DD5
* $62E9  A9 05                    LDA #$05
* $62EB  D0 D8                    BNE $62C5
* $62ED  C8                       INY
* $62EE  B1 9B                    LDA ($9B),Y
* $62F0  8D F6 62                 STA $62F6
* $62F3  A9 00                    LDA #$00
* $62F5  8D 54 C0                 STA PAGE1
* $62F8  F0 C9                    BEQ $62C3
  $62FA  C8                       INY
  $62FB  B1 9B                    LDA ($9B),Y
  $62FD  99 B2 00                 STA $00B2,Y
  $6300  C0 02                    CPY #$02
  $6302  D0 F6                    BNE $62FA
  $6304  20 8F 6D                 JSR $6D8F
  $6307  A9 03                    LDA #$03
  $6309  D0 BA                    BNE $62C5
  $630B  C8                       INY
  $630C  B1 9B                    LDA ($9B),Y
  $630E  AA                       TAX
  $630F  C8                       INY
  $6310  B1 9B                    LDA ($9B),Y
  $6312  85 9C                    STA $9C
  $6314  86 9B                    STX $9B
  $6316  4C 62 61                 JMP $6162
  $6319  A9 FF 85 7D C8 B1 9B 85  .byte $A9, $FF, $85, $7D, $C8, $B1, $9B, $85   ;  SPEED= . DEL } +  RETURN  TRACE  DEL 
  $6321  9D C8 B1 9B 85 9E 4C 07  .byte $9D, $C8, $B1, $9B, $85, $9E, $4C, $07   ;  NORMAL  +  RETURN  TRACE  DEL  INVERSE L.
  $6329  63 A9 00 8D 53 C0 8D 57  .byte $63, $A9, $00, $8D, $53, $C0, $8D, $57   ; c SPEED= . PLOT S TAB(  PLOT W
  $6331  C0 8D 50 C0 8D 54 C0 A9  .byte $C0, $8D, $50, $C0, $8D, $54, $C0, $A9   ;  TAB(  PLOT P TAB(  PLOT T TAB(  SPEED= 
  $6339  01 4C C5 62              .byte $01, $4C, $C5, $62   ; .L AT b
* $633D  85 A3                    STA $A3
* $633F  B5 00                    LDA $00,X
* $6341  85 78                    STA $78
* $6343  B5 01                    LDA $01,X
* $6345  85 79                    STA $79
* $6347  B9 00 00                 LDA $0000,Y
* $634A  85 7A                    STA $7A
* $634C  B9 01 00                 LDA $0001,Y
* $634F  85 7B                    STA $7B
* $6351  20 5C 63                 JSR $635C
* $6354  A4 A3                    LDY $A3
* $6356  99 00 00                 STA $0000,Y
* $6359  96 01                    STX $01,Y
* $635B  60                       RTS
* $635C  A5 79                    LDA $79
* $635E  45 7B                    EOR $7B
* $6360  A8                       TAY
* $6361  A5 79                    LDA $79
* $6363  30 0E                    BMI $6373
* $6365  A9 FF                    LDA #$FF
* $6367  45 78                    EOR $78
* $6369  85 78                    STA $78
* $636B  A9 FF                    LDA #$FF
* $636D  45 79                    EOR $79
* $636F  85 79                    STA $79
* $6371  30 08                    BMI $637B
* $6373  A5 78                    LDA $78
* $6375  D0 02                    BNE $6379
* $6377  C6 79                    DEC $79
* $6379  C6 78                    DEC $78
* $637B  A5 7B                    LDA $7B
* $637D  10 0D                    BPL $638C
  $637F  A9 00                    LDA #$00
  $6381  38                       SEC
  $6382  E5 7A                    SBC $7A
  $6384  85 7A                    STA $7A
  $6386  A9 00                    LDA #$00
  $6388  E5 7B                    SBC $7B
  $638A  85 7B                    STA $7B
* $638C  46 78                    LSR $78
* $638E  90 02                    BCC $6392
* $6390  A9 00                    LDA #$00
* $6392  4A                       LSR A
* $6393  66 78                    ROR $78
* $6395  B0 02                    BCS $6399
* $6397  65 7B                    ADC $7B
* $6399  4A                       LSR A
* $639A  66 78                    ROR $78
* $639C  B0 02                    BCS $63A0
* $639E  65 7B                    ADC $7B
* $63A0  4A                       LSR A
* $63A1  66 78                    ROR $78
* $63A3  B0 02                    BCS $63A7
* $63A5  65 7B                    ADC $7B
* $63A7  4A                       LSR A
* $63A8  66 78                    ROR $78
* $63AA  B0 02                    BCS $63AE
* $63AC  65 7B                    ADC $7B
* $63AE  4A                       LSR A
* $63AF  66 78                    ROR $78
* $63B1  B0 02                    BCS $63B5
* $63B3  65 7B                    ADC $7B
* $63B5  4A                       LSR A
* $63B6  A2 00                    LDX #$00
* $63B8  86 A5                    STX $A5
* $63BA  46 78                    LSR $78
* $63BC  B0 0A                    BCS $63C8
* $63BE  AA                       TAX
* $63BF  A5 A5                    LDA $A5
* $63C1  65 7A                    ADC $7A
* $63C3  85 A5                    STA $A5
* $63C5  8A                       TXA
* $63C6  65 7B                    ADC $7B
* $63C8  4A                       LSR A
* $63C9  66 A5                    ROR $A5
* $63CB  46 78                    LSR $78
* $63CD  B0 0A                    BCS $63D9
* $63CF  AA                       TAX
* $63D0  A5 A5                    LDA $A5
* $63D2  65 7A                    ADC $7A
* $63D4  85 A5                    STA $A5
* $63D6  8A                       TXA
* $63D7  65 7B                    ADC $7B
* $63D9  4A                       LSR A
* $63DA  66 A5                    ROR $A5
* $63DC  46 79                    LSR $79
* $63DE  B0 0A                    BCS $63EA
* $63E0  AA                       TAX
* $63E1  A5 A5                    LDA $A5
* $63E3  65 7A                    ADC $7A
* $63E5  85 A5                    STA $A5
* $63E7  8A                       TXA
* $63E8  65 7B                    ADC $7B
* $63EA  4A                       LSR A
* $63EB  66 A5                    ROR $A5
* $63ED  46 79                    LSR $79
* $63EF  B0 0A                    BCS $63FB
* $63F1  AA                       TAX
* $63F2  A5 A5                    LDA $A5
* $63F4  65 7A                    ADC $7A
* $63F6  85 A5                    STA $A5
* $63F8  8A                       TXA
* $63F9  65 7B                    ADC $7B
* $63FB  4A                       LSR A
* $63FC  66 A5                    ROR $A5
* $63FE  46 79                    LSR $79
* $6400  B0 0A                    BCS $640C
* $6402  AA                       TAX
* $6403  A5 A5                    LDA $A5
* $6405  65 7A                    ADC $7A
* $6407  85 A5                    STA $A5
* $6409  8A                       TXA
* $640A  65 7B                    ADC $7B
* $640C  4A                       LSR A
* $640D  66 A5                    ROR $A5
* $640F  46 79                    LSR $79
* $6411  B0 0A                    BCS $641D
* $6413  AA                       TAX
* $6414  A5 A5                    LDA $A5
* $6416  65 7A                    ADC $7A
* $6418  85 A5                    STA $A5
* $641A  8A                       TXA
* $641B  65 7B                    ADC $7B
* $641D  4A                       LSR A
* $641E  66 A5                    ROR $A5
* $6420  46 79                    LSR $79
* $6422  B0 0A                    BCS $642E
* $6424  AA                       TAX
* $6425  A5 A5                    LDA $A5
* $6427  65 7A                    ADC $7A
* $6429  85 A5                    STA $A5
* $642B  8A                       TXA
* $642C  65 7B                    ADC $7B
* $642E  4A                       LSR A
* $642F  66 A5                    ROR $A5
* $6431  46 79                    LSR $79
* $6433  B0 0A                    BCS $643F
* $6435  AA                       TAX
* $6436  A5 A5                    LDA $A5
* $6438  65 7A                    ADC $7A
* $643A  85 A5                    STA $A5
* $643C  8A                       TXA
* $643D  65 7B                    ADC $7B
* $643F  4A                       LSR A
* $6440  66 A5                    ROR $A5
* $6442  46 79                    LSR $79
* $6444  B0 0A                    BCS $6450
* $6446  AA                       TAX
* $6447  A5 A5                    LDA $A5
* $6449  65 7A                    ADC $7A
* $644B  85 A5                    STA $A5
* $644D  8A                       TXA
* $644E  65 7B                    ADC $7B
* $6450  4A                       LSR A
* $6451  66 A5                    ROR $A5
* $6453  C0 00                    CPY #$00
* $6455  10 0D                    BPL $6464
* $6457  85 A6                    STA $A6
* $6459  A9 00                    LDA #$00
* $645B  38                       SEC
* $645C  E5 A5                    SBC $A5
* $645E  85 A5                    STA $A5
* $6460  A9 00                    LDA #$00
* $6462  E5 A6                    SBC $A6
* $6464  AA                       TAX
* $6465  A5 A5                    LDA $A5
* $6467  60                       RTS
* $6468  09 00                    ORA #$00
* $646A  30 0C                    BMI $6478
* $646C  A4 7B                    LDY $7B
* $646E  30 02                    BMI $6472
* $6470  10 44                    BPL $64B6
  $6472  20 95 64                 JSR $6495
  $6475  4C A5 64                 JMP $64A5
* $6478  20 87 64                 JSR $6487
* $647B  A4 7B                    LDY $7B
* $647D  30 02                    BMI $6481
* $647F  10 24                    BPL $64A5
  $6481  20 95 64                 JSR $6495
  $6484  4C B6 64                 JMP $64B6
* $6487  A8                       TAY
* $6488  8A                       TXA
* $6489  49 FF                    EOR #$FF
* $648B  18                       CLC
* $648C  69 01                    ADC #$01
* $648E  AA                       TAX
* $648F  98                       TYA
* $6490  49 FF                    EOR #$FF
* $6492  69 00                    ADC #$00
* $6494  60                       RTS
  $6495  A8                       TAY
  $6496  A9 00                    LDA #$00
  $6498  38                       SEC
  $6499  E5 7A                    SBC $7A
  $649B  85 7A                    STA $7A
  $649D  A9 00                    LDA #$00
  $649F  E5 7B                    SBC $7B
  $64A1  85 7B                    STA $7B
  $64A3  98                       TYA
  $64A4  60                       RTS
* $64A5  20 B6 64                 JSR $64B6
* $64A8  A9 00                    LDA #$00
* $64AA  38                       SEC
* $64AB  E5 78                    SBC $78
* $64AD  85 78                    STA $78
* $64AF  A9 00                    LDA #$00
* $64B1  E5 79                    SBC $79
* $64B3  85 79                    STA $79
* $64B5  60                       RTS
* $64B6  A0 0F                    LDY #$0F
* $64B8  86 A5                    STX $A5
* $64BA  AA                       TAX
* $64BB  A5 A5                    LDA $A5
* $64BD  38                       SEC
* $64BE  E5 7A                    SBC $7A
* $64C0  85 A5                    STA $A5
* $64C2  8A                       TXA
* $64C3  E5 7B                    SBC $7B
* $64C5  30 0D                    BMI $64D4
* $64C7  38                       SEC
* $64C8  26 78                    ROL $78
* $64CA  26 79                    ROL $79
* $64CC  06 A5                    ASL $A5
* $64CE  2A                       ROL A
* $64CF  88                       DEY
* $64D0  D0 E8                    BNE $64BA
* $64D2  F0 19                    BEQ $64ED
* $64D4  06 78                    ASL $78
* $64D6  26 79                    ROL $79
* $64D8  06 A5                    ASL $A5
* $64DA  2A                       ROL A
* $64DB  88                       DEY
* $64DC  F0 0F                    BEQ $64ED
* $64DE  AA                       TAX
* $64DF  A5 A5                    LDA $A5
* $64E1  18                       CLC
* $64E2  65 7A                    ADC $7A
* $64E4  85 A5                    STA $A5
* $64E6  8A                       TXA
* $64E7  65 7B                    ADC $7B
* $64E9  30 E9                    BMI $64D4
* $64EB  10 DA                    BPL $64C7
* $64ED  06 78                    ASL $78
* $64EF  26 79                    ROL $79
* $64F1  10 04                    BPL $64F7
  $64F3  C6 78                    DEC $78
  $64F5  C6 79                    DEC $79
* $64F7  60                       RTS
* $64F8  38                       SEC
* $64F9  E9 40                    SBC #$40
* $64FB  AA                       TAX
* $64FC  30 1F                    BMI $651D
* $64FE  C9 40                    CMP #$40
* $6500  30 12                    BMI $6514
* $6502  18                       CLC
* $6503  69 7F                    ADC #$7F
* $6505  49 FF                    EOR #$FF
* $6507  0A                       ASL A
* $6508  A8                       TAY
* $6509  38                       SEC
* $650A  A9 00                    LDA #$00
* $650C  F9 9B 60                 SBC $609B,Y
* $650F  AA                       TAX
* $6510  F9 9A 60                 SBC $609A,Y
* $6513  60                       RTS
* $6514  0A                       ASL A
* $6515  A8                       TAY
* $6516  BE 9B 60                 LDX $609B,Y
* $6519  B9 9A 60                 LDA $609A,Y
* $651C  60                       RTS
* $651D  49 FF                    EOR #$FF
* $651F  18                       CLC
* $6520  69 01                    ADC #$01
* $6522  10 DA                    BPL $64FE
  $6524  30 E1                    BMI $6507
* $6526  08                       PHP
* $6527  48                       PHA
* $6528  8A                       TXA
* $6529  48                       PHA
* $652A  98                       TYA
* $652B  48                       PHA
* $652C  AD 0C 60                 LDA M1
* $652F  20 F8 64                 JSR $64F8
* $6532  8E 0D 60                 STX M2
* $6535  8D 0C 60                 STA M1
* $6538  68                       PLA
* $6539  A8                       TAY
* $653A  68                       PLA
* $653B  AA                       TAX
* $653C  68                       PLA
* $653D  28                       PLP
* $653E  60                       RTS
* $653F  08                       PHP
* $6540  48                       PHA
* $6541  8A                       TXA
* $6542  48                       PHA
* $6543  98                       TYA
* $6544  48                       PHA
* $6545  AD 0C 60                 LDA M1
* $6548  20 FB 64                 JSR $64FB
* $654B  4C 32 65                 JMP $6532
* $654E  A5 96                    LDA $96
* $6550  20 F8 64                 JSR $64F8
* $6553  85 60                    STA $60
* $6555  86 61                    STX $61
* $6557  A5 97                    LDA $97
* $6559  20 F8 64                 JSR $64F8
* $655C  85 62                    STA $62
* $655E  86 63                    STX $63
* $6560  A5 98                    LDA $98
* $6562  20 F8 64                 JSR $64F8
* $6565  85 64                    STA $64
* $6567  86 65                    STX $65
* $6569  A5 96                    LDA $96
* $656B  20 FB 64                 JSR $64FB
* $656E  85 66                    STA $66
* $6570  86 67                    STX $67
* $6572  A5 97                    LDA $97
* $6574  20 FB 64                 JSR $64FB
* $6577  85 68                    STA $68
* $6579  86 69                    STX $69
* $657B  A5 98                    LDA $98
* $657D  20 FB 64                 JSR $64FB
* $6580  85 6A                    STA $6A
* $6582  86 6B                    STX $6B
* $6584  A2 6A                    LDX #$6A
* $6586  A0 68                    LDY #$68
* $6588  A9 6C                    LDA #$6C
* $658A  20 3D 63                 JSR $633D
* $658D  A2 64                    LDX #$64
* $658F  A0 62                    LDY #$62
* $6591  A9 6E                    LDA #$6E
* $6593  20 3D 63                 JSR $633D
* $6596  A2 6A                    LDX #$6A
* $6598  A0 62                    LDY #$62
* $659A  A9 70                    LDA #$70
* $659C  20 3D 63                 JSR $633D
* $659F  A2 64                    LDX #$64
* $65A1  A0 68                    LDY #$68
* $65A3  A9 72                    LDA #$72
* $65A5  20 3D 63                 JSR $633D
* $65A8  A2 60                    LDX #$60
* $65AA  A0 6E                    LDY #$6E
* $65AC  A9 74                    LDA #$74
* $65AE  20 3D 63                 JSR $633D
* $65B1  A2 60                    LDX #$60
* $65B3  A0 72                    LDY #$72
* $65B5  A9 76                    LDA #$76
* $65B7  20 3D 63                 JSR $633D
* $65BA  A2 70                    LDX #$70
* $65BC  A0 60                    LDY #$60
* $65BE  A9 B3                    LDA #$B3
* $65C0  20 3D 63                 JSR $633D
* $65C3  A2 60                    LDX #$60
* $65C5  A0 6C                    LDY #$6C
* $65C7  A9 B5                    LDA #$B5
* $65C9  20 3D 63                 JSR $633D
* $65CC  18                       CLC
* $65CD  A5 6C                    LDA $6C
* $65CF  65 74                    ADC $74
* $65D1  85 7E                    STA $7E
* $65D3  A5 6D                    LDA $6D
* $65D5  65 75                    ADC $75
* $65D7  85 7F                    STA $7F
* $65D9  38                       SEC
* $65DA  A5 76                    LDA $76
* $65DC  E5 70                    SBC $70
* $65DE  85 80                    STA $80
* $65E0  A5 77                    LDA $77
* $65E2  E5 71                    SBC $71
* $65E4  85 81                    STA $81
* $65E6  A2 64                    LDX #$64
* $65E8  A0 66                    LDY #$66
* $65EA  A9 82                    LDA #$82
* $65EC  20 3D 63                 JSR $633D
* $65EF  A2 62                    LDX #$62
* $65F1  A0 66                    LDY #$66
* $65F3  A9 84                    LDA #$84
* $65F5  20 3D 63                 JSR $633D
* $65F8  A2 66                    LDX #$66
* $65FA  A0 68                    LDY #$68
* $65FC  A9 86                    LDA #$86
* $65FE  20 3D 63                 JSR $633D
* $6601  A9 00                    LDA #$00
* $6603  38                       SEC
* $6604  E5 60                    SBC $60
* $6606  85 88                    STA $88
* $6608  A9 00                    LDA #$00
* $660A  E5 61                    SBC $61
* $660C  85 89                    STA $89
* $660E  38                       SEC
* $660F  A5 B3                    LDA $B3
* $6611  E5 72                    SBC $72
* $6613  85 8A                    STA $8A
* $6615  A5 B4                    LDA $B4
* $6617  E5 73                    SBC $73
* $6619  85 8B                    STA $8B
* $661B  18                       CLC
* $661C  A5 6E                    LDA $6E
* $661E  65 B5                    ADC $B5
* $6620  85 8C                    STA $8C
* $6622  A5 6F                    LDA $6F
* $6624  65 B6                    ADC $B6
* $6626  85 8D                    STA $8D
* $6628  A2 6A                    LDX #$6A
* $662A  A0 66                    LDY #$66
* $662C  A9 8E                    LDA #$8E
* $662E  20 3D 63                 JSR $633D
* $6631  AE 0F 60                 LDX $600F
* $6634  E0 7F                    CPX #$7F
* $6636  D0 07                    BNE $663F
  $6638  AD 0E 60                 LDA $600E
  $663B  C9 FF                    CMP #$FF
  $663D  F0 45                    BEQ $6684
* $663F  85 78                    STA $78
* $6641  86 79                    STX $79
* $6643  A5 7E                    LDA $7E
* $6645  A6 7F                    LDX $7F
* $6647  85 7A                    STA $7A
* $6649  86 7B                    STX $7B
* $664B  20 5C 63                 JSR $635C
* $664E  85 7E                    STA $7E
* $6650  86 7F                    STX $7F
* $6652  A5 84                    LDA $84
* $6654  A6 85                    LDX $85
* $6656  85 78                    STA $78
* $6658  86 79                    STX $79
* $665A  AD 0E 60                 LDA $600E
* $665D  AE 0F 60                 LDX $600F
* $6660  85 7A                    STA $7A
* $6662  86 7B                    STX $7B
* $6664  20 5C 63                 JSR $635C
* $6667  85 84                    STA $84
* $6669  86 85                    STX $85
* $666B  A5 8A                    LDA $8A
* $666D  A6 8B                    LDX $8B
* $666F  85 78                    STA $78
* $6671  86 79                    STX $79
* $6673  AD 0E 60                 LDA $600E
* $6676  AE 0F 60                 LDX $600F
* $6679  85 7A                    STA $7A
* $667B  86 7B                    STX $7B
* $667D  20 5C 63                 JSR $635C
* $6680  85 8A                    STA $8A
* $6682  86 8B                    STX $8B
* $6684  AE 11 60                 LDX $6011
* $6687  E0 7F                    CPX #$7F
* $6689  D0 07                    BNE $6692
* $668B  AD 10 60                 LDA $6010
* $668E  C9 FF                    CMP #$FF
* $6690  F0 45                    BEQ $66D7
  $6692  85 78                    STA $78
  $6694  86 79                    STX $79
  $6696  A5 80                    LDA $80
  $6698  A6 81                    LDX $81
  $669A  85 7A                    STA $7A
  $669C  86 7B                    STX $7B
  $669E  20 5C 63                 JSR $635C
  $66A1  85 80                    STA $80
  $66A3  86 81                    STX $81
  $66A5  AD 10 60                 LDA $6010
  $66A8  AE 11 60                 LDX $6011
  $66AB  85 78                    STA $78
  $66AD  86 79                    STX $79
  $66AF  A5 86                    LDA $86
  $66B1  A6 87                    LDX $87
  $66B3  85 7A                    STA $7A
  $66B5  86 7B                    STX $7B
  $66B7  20 5C 63                 JSR $635C
  $66BA  85 86                    STA $86
  $66BC  86 87                    STX $87
  $66BE  AD 10 60                 LDA $6010
  $66C1  AE 11 60                 LDX $6011
  $66C4  85 78                    STA $78
  $66C6  86 79                    STX $79
  $66C8  A5 8C                    LDA $8C
  $66CA  A6 8D                    LDX $8D
  $66CC  85 7A                    STA $7A
  $66CE  86 7B                    STX $7B
  $66D0  20 5C 63                 JSR $635C
  $66D3  85 8C                    STA $8C
  $66D5  86 8D                    STX $8D
* $66D7  AE 13 60                 LDX $6013
* $66DA  E0 7F                    CPX #$7F
* $66DC  D0 07                    BNE $66E5
  $66DE  AD 12 60                 LDA $6012
  $66E1  C9 FF                    CMP #$FF
  $66E3  F0 45                    BEQ $672A
* $66E5  85 78                    STA $78
* $66E7  86 79                    STX $79
* $66E9  A5 82                    LDA $82
* $66EB  A6 83                    LDX $83
* $66ED  85 7A                    STA $7A
* $66EF  86 7B                    STX $7B
* $66F1  20 5C 63                 JSR $635C
* $66F4  85 82                    STA $82
* $66F6  86 83                    STX $83
* $66F8  AD 12 60                 LDA $6012
* $66FB  AE 13 60                 LDX $6013
* $66FE  85 78                    STA $78
* $6700  86 79                    STX $79
* $6702  A5 88                    LDA $88
* $6704  A6 89                    LDX $89
* $6706  85 7A                    STA $7A
* $6708  86 7B                    STX $7B
* $670A  20 5C 63                 JSR $635C
* $670D  85 88                    STA $88
* $670F  86 89                    STX $89
* $6711  AD 12 60                 LDA $6012
* $6714  AE 13 60                 LDX $6013
* $6717  85 78                    STA $78
* $6719  86 79                    STX $79
* $671B  A5 8E                    LDA $8E
* $671D  A6 8F                    LDX $8F
* $671F  85 7A                    STA $7A
* $6721  86 7B                    STX $7B
* $6723  20 5C 63                 JSR $635C
* $6726  85 8E                    STA $8E
* $6728  86 8F                    STX $8F
* $672A  60                       RTS
* $672B  84 B2                    STY $B2
* $672D  A0 01                    LDY #$01
* $672F  B1 9B                    LDA ($9B),Y
* $6731  38                       SEC
* $6732  E5 90                    SBC $90
* $6734  85 AB                    STA $AB
* $6736  C8                       INY
* $6737  B1 9B                    LDA ($9B),Y
* $6739  E5 91                    SBC $91
* $673B  85 AC                    STA $AC
* $673D  C8                       INY
* $673E  B1 9B                    LDA ($9B),Y
* $6740  38                       SEC
* $6741  E5 92                    SBC $92
* $6743  85 AD                    STA $AD
* $6745  C8                       INY
* $6746  B1 9B                    LDA ($9B),Y
* $6748  E5 93                    SBC $93
* $674A  85 AE                    STA $AE
* $674C  C8                       INY
* $674D  B1 9B                    LDA ($9B),Y
* $674F  38                       SEC
* $6750  E5 94                    SBC $94
* $6752  85 AF                    STA $AF
* $6754  C8                       INY
* $6755  B1 9B                    LDA ($9B),Y
* $6757  E5 95                    SBC $95
* $6759  85 B0                    STA $B0
* $675B  A2 AB                    LDX #$AB
* $675D  A0 7E                    LDY #$7E
* $675F  A9 A7                    LDA #$A7
* $6761  20 3D 63                 JSR $633D
* $6764  A2 AD                    LDX #$AD
* $6766  A0 84                    LDY #$84
* $6768  A9 A9                    LDA #$A9
* $676A  20 3D 63                 JSR $633D
* $676D  A5 AF                    LDA $AF
* $676F  A6 B0                    LDX $B0
* $6771  85 78                    STA $78
* $6773  86 79                    STX $79
* $6775  A5 8A                    LDA $8A
* $6777  A6 8B                    LDX $8B
* $6779  85 7A                    STA $7A
* $677B  86 7B                    STX $7B
* $677D  20 5C 63                 JSR $635C
* $6780  20 D4 67                 JSR $67D4
* $6783  A2 AB                    LDX #$AB
* $6785  A0 80                    LDY #$80
* $6787  A9 A7                    LDA #$A7
* $6789  20 3D 63                 JSR $633D
* $678C  A2 AD                    LDX #$AD
* $678E  A0 86                    LDY #$86
* $6790  A9 A9                    LDA #$A9
* $6792  20 3D 63                 JSR $633D
* $6795  A5 AF                    LDA $AF
* $6797  A6 B0                    LDX $B0
* $6799  85 78                    STA $78
* $679B  86 79                    STX $79
* $679D  A5 8C                    LDA $8C
* $679F  A6 8D                    LDX $8D
* $67A1  85 7A                    STA $7A
* $67A3  86 7B                    STX $7B
* $67A5  20 5C 63                 JSR $635C
* $67A8  20 D4 67                 JSR $67D4
* $67AB  A2 AB                    LDX #$AB
* $67AD  A0 82                    LDY #$82
* $67AF  A9 A7                    LDA #$A7
* $67B1  20 3D 63                 JSR $633D
* $67B4  A2 AD                    LDX #$AD
* $67B6  A0 88                    LDY #$88
* $67B8  A9 A9                    LDA #$A9
* $67BA  20 3D 63                 JSR $633D
* $67BD  A5 AF                    LDA $AF
* $67BF  A6 B0                    LDX $B0
* $67C1  85 78                    STA $78
* $67C3  86 79                    STX $79
* $67C5  A5 8E                    LDA $8E
* $67C7  A6 8F                    LDX $8F
* $67C9  85 7A                    STA $7A
* $67CB  86 7B                    STX $7B
* $67CD  20 5C 63                 JSR $635C
* $67D0  20 D4 67                 JSR $67D4
* $67D3  60                       RTS
* $67D4  18                       CLC
* $67D5  65 A7                    ADC $A7
* $67D7  A8                       TAY
* $67D8  8A                       TXA
* $67D9  65 A8                    ADC $A8
* $67DB  AA                       TAX
* $67DC  98                       TYA
* $67DD  18                       CLC
* $67DE  65 A9                    ADC $A9
* $67E0  A8                       TAY
* $67E1  8A                       TXA
* $67E2  65 AA                    ADC $AA
* $67E4  A6 B2                    LDX $B2
* $67E6  95 01                    STA $01,X
* $67E8  94 00                    STY $00,X
* $67EA  E6 B2                    INC $B2
* $67EC  E6 B2                    INC $B2
* $67EE  60                       RTS
* $67EF  A2 00                    LDX #$00
* $67F1  A5 60                    LDA $60
* $67F3  18                       CLC
* $67F4  65 64                    ADC $64
* $67F6  A5 61                    LDA $61
* $67F8  65 65                    ADC $65
* $67FA  30 04                    BMI $6800
* $67FC  50 06                    BVC $6804
  $67FE  70 02                    BVS $6802
* $6800  70 02                    BVS $6804
* $6802  A2 40                    LDX #$40
* $6804  A5 64                    LDA $64
* $6806  38                       SEC
* $6807  E5 60                    SBC $60
* $6809  A5 65                    LDA $65
* $680B  E5 61                    SBC $61
* $680D  30 04                    BMI $6813
* $680F  50 08                    BVC $6819
  $6811  70 02                    BVS $6815
* $6813  70 04                    BVS $6819
* $6815  8A                       TXA
* $6816  09 20                    ORA #$20
* $6818  AA                       TAX
* $6819  A5 62                    LDA $62
* $681B  18                       CLC
* $681C  65 64                    ADC $64
* $681E  A5 63                    LDA $63
* $6820  65 65                    ADC $65
* $6822  30 04                    BMI $6828
* $6824  50 08                    BVC $682E
  $6826  70 02                    BVS $682A
* $6828  70 04                    BVS $682E
* $682A  8A                       TXA
* $682B  09 10                    ORA #$10
* $682D  AA                       TAX
* $682E  A5 64                    LDA $64
* $6830  38                       SEC
* $6831  E5 62                    SBC $62
* $6833  A5 65                    LDA $65
* $6835  E5 63                    SBC $63
* $6837  30 04                    BMI $683D
* $6839  50 0A                    BVC $6845
  $683B  70 02                    BVS $683F
* $683D  70 06                    BVS $6845
* $683F  8A                       TXA
* $6840  09 08                    ORA #$08
* $6842  85 66                    STA $66
* $6844  60                       RTS
* $6845  86 66                    STX $66
* $6847  60                       RTS
* $6848  A2 00                    LDX #$00
* $684A  A5 68                    LDA $68
* $684C  18                       CLC
* $684D  65 6C                    ADC $6C
* $684F  A5 69                    LDA $69
* $6851  65 6D                    ADC $6D
* $6853  30 04                    BMI $6859
* $6855  50 06                    BVC $685D
  $6857  70 02                    BVS $685B
  $6859  70 02                    BVS $685D
  $685B  A2 40                    LDX #$40
* $685D  A5 6C                    LDA $6C
* $685F  38                       SEC
* $6860  E5 68                    SBC $68
* $6862  A5 6D                    LDA $6D
* $6864  E5 69                    SBC $69
* $6866  30 04                    BMI $686C
* $6868  50 08                    BVC $6872
  $686A  70 02                    BVS $686E
  $686C  70 04                    BVS $6872
  $686E  8A                       TXA
  $686F  09 20                    ORA #$20
  $6871  AA                       TAX
* $6872  A5 6A                    LDA $6A
* $6874  18                       CLC
* $6875  65 6C                    ADC $6C
* $6877  A5 6B                    LDA $6B
* $6879  65 6D                    ADC $6D
* $687B  30 04                    BMI $6881
* $687D  50 08                    BVC $6887
  $687F  70 02                    BVS $6883
  $6881  70 04                    BVS $6887
  $6883  8A                       TXA
  $6884  09 10                    ORA #$10
  $6886  AA                       TAX
* $6887  A5 6C                    LDA $6C
* $6889  38                       SEC
* $688A  E5 6A                    SBC $6A
* $688C  A5 6D                    LDA $6D
* $688E  E5 6B                    SBC $6B
* $6890  30 04                    BMI $6896
* $6892  50 0A                    BVC $689E
  $6894  70 02                    BVS $6898
  $6896  70 06                    BVS $689E
  $6898  8A                       TXA
  $6899  09 08                    ORA #$08
  $689B  85 6E                    STA $6E
  $689D  60                       RTS
* $689E  86 6E                    STX $6E
* $68A0  60                       RTS
* $68A1  86 A7                    STX $A7
* $68A3  84 A8                    STY $A8
* $68A5  B9 04 00                 LDA $0004,Y
* $68A8  85 7A                    STA $7A
* $68AA  B9 05 00                 LDA $0005,Y
* $68AD  85 7B                    STA $7B
* $68AF  B6 00                    LDX $00,Y
* $68B1  B9 01 00                 LDA $0001,Y
* $68B4  20 68 64                 JSR $6468
* $68B7  A5 79                    LDA $79
* $68B9  A2 45                    LDX #$45
* $68BB  20 1E 69                 JSR $691E
* $68BE  18                       CLC
* $68BF  69 00                    ADC #$00
* $68C1  A4 A7                    LDY $A7
* $68C3  99 00 00                 STA $0000,Y
* $68C6  A4 A8                    LDY $A8
* $68C8  B9 04 00                 LDA $0004,Y
* $68CB  85 7A                    STA $7A
* $68CD  B9 05 00                 LDA $0005,Y
* $68D0  85 7B                    STA $7B
* $68D2  B6 02                    LDX $02,Y
* $68D4  B9 03 00                 LDA $0003,Y
* $68D7  20 68 64                 JSR $6468
* $68DA  A5 79                    LDA $79
* $68DC  A2 5E                    LDX #$5E
* $68DE  20 1E 69                 JSR $691E
* $68E1  18                       CLC
* $68E2  69 00                    ADC #$00
* $68E4  A4 A7                    LDY $A7
* $68E6  99 01 00                 STA $0001,Y
* $68E9  60                       RTS
* $68EA  C8                       INY
* $68EB  B1 9B                    LDA ($9B),Y
* $68ED  18                       CLC
* $68EE  6A                       ROR A
* $68EF  38                       SEC
* $68F0  E9 01                    SBC #$01
* $68F2  8D BA 68                 STA $68BA
* $68F5  C8                       INY
* $68F6  B1 9B                    LDA ($9B),Y
* $68F8  18                       CLC
* $68F9  6A                       ROR A
* $68FA  38                       SEC
* $68FB  E9 01                    SBC #$01
* $68FD  8D DD 68                 STA $68DD
* $6900  C8                       INY
* $6901  B1 9B                    LDA ($9B),Y
* $6903  8D C0 68                 STA $68C0
* $6906  C8                       INY
* $6907  B1 9B                    LDA ($9B),Y
* $6909  8D E3 68                 STA $68E3
* $690C  4C E9 62                 JMP $62E9
* $690F  C8                       INY
* $6910  B1 9B                    LDA ($9B),Y
* $6912  99 0D 60                 STA M2,Y
* $6915  C0 06                    CPY #$06
* $6917  D0 F6                    BNE $690F
* $6919  A9 07                    LDA #$07
* $691B  4C C5 62                 JMP $62C5
* $691E  49 FF                    EOR #$FF
* $6920  85 78                    STA $78
* $6922  86 7B                    STX $7B
* $6924  A9 00                    LDA #$00
* $6926  66 78                    ROR $78
* $6928  B0 01                    BCS $692B
* $692A  8A                       TXA
* $692B  4A                       LSR A
* $692C  66 78                    ROR $78
* $692E  B0 02                    BCS $6932
* $6930  65 7B                    ADC $7B
* $6932  4A                       LSR A
* $6933  66 78                    ROR $78
* $6935  B0 02                    BCS $6939
* $6937  65 7B                    ADC $7B
* $6939  4A                       LSR A
* $693A  66 78                    ROR $78
* $693C  B0 02                    BCS $6940
* $693E  65 7B                    ADC $7B
* $6940  4A                       LSR A
* $6941  66 78                    ROR $78
* $6943  B0 02                    BCS $6947
* $6945  65 7B                    ADC $7B
* $6947  4A                       LSR A
* $6948  66 78                    ROR $78
* $694A  B0 02                    BCS $694E
* $694C  65 7B                    ADC $7B
* $694E  4A                       LSR A
* $694F  66 78                    ROR $78
* $6951  B0 02                    BCS $6955
* $6953  65 7B                    ADC $7B
* $6955  4A                       LSR A
* $6956  66 78                    ROR $78
* $6958  B0 04                    BCS $695E
* $695A  38                       SEC
* $695B  38                       SEC
* $695C  E5 7B                    SBC $7B
* $695E  60                       RTS
  $695F  20 69 69                 JSR $6969
  $6962  20 79 69                 JSR $6979
  $6965  20 69 69                 JSR $6969
  $6968  60                       RTS
  $6969  A0 08                    LDY #$08
  $696B  B9 5F 00                 LDA $005F,Y
  $696E  B6 67                    LDX $67,Y
  $6970  99 67 00                 STA $0067,Y
  $6973  96 5F                    STX $5F,Y
  $6975  88                       DEY
  $6976  D0 F3                    BNE $696B
  $6978  60                       RTS
  $6979  A5 6E                    LDA $6E
  $697B  29 BF                    AND #$BF
  $697D  F0 0A                    BEQ $6989
  $697F  29 DF                    AND #$DF
  $6981  F0 09                    BEQ $698C
  $6983  29 EF                    AND #$EF
  $6985  F0 08                    BEQ $698F
  $6987  D0 09                    BNE $6992
  $6989  4C 0D 6B                 JMP $6B0D
  $698C  4C 92 6A                 JMP $6A92
  $698F  4C 0D 6A                 JMP $6A0D
  $6992  38                       SEC
  $6993  A5 64                    LDA $64
  $6995  E5 6C                    SBC $6C
  $6997  85 7A                    STA $7A
  $6999  A5 65                    LDA $65
  $699B  E5 6D                    SBC $6D
  $699D  85 7B                    STA $7B
  $699F  A5 62                    LDA $62
  $69A1  38                       SEC
  $69A2  E5 6A                    SBC $6A
  $69A4  AA                       TAX
  $69A5  A5 63                    LDA $63
  $69A7  E5 6B                    SBC $6B
  $69A9  A8                       TAY
  $69AA  8A                       TXA
  $69AB  38                       SEC
  $69AC  E5 7A                    SBC $7A
  $69AE  85 7A                    STA $7A
  $69B0  98                       TYA
  $69B1  E5 7B                    SBC $7B
  $69B3  85 7B                    STA $7B
  $69B5  A5 6C                    LDA $6C
  $69B7  38                       SEC
  $69B8  E5 6A                    SBC $6A
  $69BA  AA                       TAX
  $69BB  A5 6D                    LDA $6D
  $69BD  E5 6B                    SBC $6B
  $69BF  20 68 64                 JSR $6468
  $69C2  38                       SEC
  $69C3  A5 60                    LDA $60
  $69C5  E5 68                    SBC $68
  $69C7  85 7A                    STA $7A
  $69C9  A5 61                    LDA $61
  $69CB  E5 69                    SBC $69
  $69CD  85 7B                    STA $7B
  $69CF  A5 78                    LDA $78
  $69D1  A6 79                    LDX $79
  $69D3  85 A7                    STA $A7
  $69D5  86 A8                    STX $A8
  $69D7  20 5C 63                 JSR $635C
  $69DA  18                       CLC
  $69DB  65 68                    ADC $68
  $69DD  85 68                    STA $68
  $69DF  8A                       TXA
  $69E0  65 69                    ADC $69
  $69E2  85 69                    STA $69
  $69E4  38                       SEC
  $69E5  A5 64                    LDA $64
  $69E7  E5 6C                    SBC $6C
  $69E9  85 7A                    STA $7A
  $69EB  A5 65                    LDA $65
  $69ED  E5 6D                    SBC $6D
  $69EF  85 7B                    STA $7B
  $69F1  A5 A7                    LDA $A7
  $69F3  A6 A8                    LDX $A8
  $69F5  85 78                    STA $78
  $69F7  86 79                    STX $79
  $69F9  20 5C 63                 JSR $635C
  $69FC  18                       CLC
  $69FD  65 6C                    ADC $6C
  $69FF  85 6C                    STA $6C
  $6A01  85 6A                    STA $6A
  $6A03  8A                       TXA
  $6A04  65 6D                    ADC $6D
  $6A06  85 6D                    STA $6D
  $6A08  85 6B                    STA $6B
  $6A0A  4C 48 68                 JMP $6848
  $6A0D  38                       SEC
  $6A0E  A5 64                    LDA $64
  $6A10  E5 6C                    SBC $6C
  $6A12  85 7A                    STA $7A
  $6A14  A5 65                    LDA $65
  $6A16  E5 6D                    SBC $6D
  $6A18  85 7B                    STA $7B
  $6A1A  A5 6A                    LDA $6A
  $6A1C  38                       SEC
  $6A1D  E5 62                    SBC $62
  $6A1F  AA                       TAX
  $6A20  A5 6B                    LDA $6B
  $6A22  E5 63                    SBC $63
  $6A24  A8                       TAY
  $6A25  8A                       TXA
  $6A26  38                       SEC
  $6A27  E5 7A                    SBC $7A
  $6A29  85 7A                    STA $7A
  $6A2B  98                       TYA
  $6A2C  E5 7B                    SBC $7B
  $6A2E  85 7B                    STA $7B
  $6A30  A5 6C                    LDA $6C
  $6A32  18                       CLC
  $6A33  65 6A                    ADC $6A
  $6A35  AA                       TAX
  $6A36  A5 6D                    LDA $6D
  $6A38  65 6B                    ADC $6B
  $6A3A  20 68 64                 JSR $6468
  $6A3D  38                       SEC
  $6A3E  A5 60                    LDA $60
  $6A40  E5 68                    SBC $68
  $6A42  85 7A                    STA $7A
  $6A44  A5 61                    LDA $61
  $6A46  E5 69                    SBC $69
  $6A48  85 7B                    STA $7B
  $6A4A  A5 78                    LDA $78
  $6A4C  A6 79                    LDX $79
  $6A4E  85 A7                    STA $A7
  $6A50  86 A8                    STX $A8
  $6A52  20 5C 63                 JSR $635C
  $6A55  18                       CLC
  $6A56  65 68                    ADC $68
  $6A58  85 68                    STA $68
  $6A5A  8A                       TXA
  $6A5B  65 69                    ADC $69
  $6A5D  85 69                    STA $69
  $6A5F  38                       SEC
  $6A60  A5 64                    LDA $64
  $6A62  E5 6C                    SBC $6C
  $6A64  85 7A                    STA $7A
  $6A66  A5 65                    LDA $65
  $6A68  E5 6D                    SBC $6D
  $6A6A  85 7B                    STA $7B
  $6A6C  A5 A7                    LDA $A7
  $6A6E  A6 A8                    LDX $A8
  $6A70  85 78                    STA $78
  $6A72  86 79                    STX $79
  $6A74  20 5C 63                 JSR $635C
  $6A77  18                       CLC
  $6A78  65 6C                    ADC $6C
  $6A7A  85 6C                    STA $6C
  $6A7C  49 FF                    EOR #$FF
  $6A7E  85 6A                    STA $6A
  $6A80  8A                       TXA
  $6A81  65 6D                    ADC $6D
  $6A83  85 6D                    STA $6D
  $6A85  49 FF                    EOR #$FF
  $6A87  85 6B                    STA $6B
  $6A89  E6 6A                    INC $6A
  $6A8B  D0 02                    BNE $6A8F
  $6A8D  E6 6B                    INC $6B
  $6A8F  4C 48 68                 JMP $6848
  $6A92  38                       SEC
  $6A93  A5 64                    LDA $64
  $6A95  E5 6C                    SBC $6C
  $6A97  85 7A                    STA $7A
  $6A99  A5 65                    LDA $65
  $6A9B  E5 6D                    SBC $6D
  $6A9D  85 7B                    STA $7B
  $6A9F  A5 60                    LDA $60
  $6AA1  38                       SEC
  $6AA2  E5 68                    SBC $68
  $6AA4  AA                       TAX
  $6AA5  A5 61                    LDA $61
  $6AA7  E5 69                    SBC $69
  $6AA9  A8                       TAY
  $6AAA  8A                       TXA
  $6AAB  38                       SEC
  $6AAC  E5 7A                    SBC $7A
  $6AAE  85 7A                    STA $7A
  $6AB0  98                       TYA
  $6AB1  E5 7B                    SBC $7B
  $6AB3  85 7B                    STA $7B
  $6AB5  A5 6C                    LDA $6C
  $6AB7  38                       SEC
  $6AB8  E5 68                    SBC $68
  $6ABA  AA                       TAX
  $6ABB  A5 6D                    LDA $6D
  $6ABD  E5 69                    SBC $69
  $6ABF  20 68 64                 JSR $6468
  $6AC2  38                       SEC
  $6AC3  A5 64                    LDA $64
  $6AC5  E5 6C                    SBC $6C
  $6AC7  85 7A                    STA $7A
  $6AC9  A5 65                    LDA $65
  $6ACB  E5 6D                    SBC $6D
  $6ACD  85 7B                    STA $7B
  $6ACF  A5 78                    LDA $78
  $6AD1  A6 79                    LDX $79
  $6AD3  85 A7                    STA $A7
  $6AD5  86 A8                    STX $A8
  $6AD7  20 5C 63                 JSR $635C
  $6ADA  18                       CLC
  $6ADB  65 6C                    ADC $6C
  $6ADD  85 6C                    STA $6C
  $6ADF  85 68                    STA $68
  $6AE1  8A                       TXA
  $6AE2  65 6D                    ADC $6D
  $6AE4  85 6D                    STA $6D
  $6AE6  85 69                    STA $69
  $6AE8  38                       SEC
  $6AE9  A5 62                    LDA $62
  $6AEB  E5 6A                    SBC $6A
  $6AED  85 7A                    STA $7A
  $6AEF  A5 63                    LDA $63
  $6AF1  E5 6B                    SBC $6B
  $6AF3  85 7B                    STA $7B
  $6AF5  A5 A7                    LDA $A7
  $6AF7  A6 A8                    LDX $A8
  $6AF9  85 78                    STA $78
  $6AFB  86 79                    STX $79
  $6AFD  20 5C 63                 JSR $635C
  $6B00  18                       CLC
  $6B01  65 6A                    ADC $6A
  $6B03  85 6A                    STA $6A
  $6B05  8A                       TXA
  $6B06  65 6B                    ADC $6B
  $6B08  85 6B                    STA $6B
  $6B0A  4C 48 68                 JMP $6848
  $6B0D  38                       SEC
  $6B0E  A5 64                    LDA $64
  $6B10  E5 6C                    SBC $6C
  $6B12  85 7A                    STA $7A
  $6B14  A5 65                    LDA $65
  $6B16  E5 6D                    SBC $6D
  $6B18  85 7B                    STA $7B
  $6B1A  A5 68                    LDA $68
  $6B1C  38                       SEC
  $6B1D  E5 60                    SBC $60
  $6B1F  AA                       TAX
  $6B20  A5 69                    LDA $69
  $6B22  E5 61                    SBC $61
  $6B24  A8                       TAY
  $6B25  8A                       TXA
  $6B26  38                       SEC
  $6B27  E5 7A                    SBC $7A
  $6B29  85 7A                    STA $7A
  $6B2B  98                       TYA
  $6B2C  E5 7B                    SBC $7B
  $6B2E  85 7B                    STA $7B
  $6B30  A5 6C                    LDA $6C
  $6B32  18                       CLC
  $6B33  65 68                    ADC $68
  $6B35  AA                       TAX
  $6B36  A5 6D                    LDA $6D
  $6B38  65 69                    ADC $69
  $6B3A  20 68 64                 JSR $6468
  $6B3D  38                       SEC
  $6B3E  A5 62                    LDA $62
  $6B40  E5 6A                    SBC $6A
  $6B42  85 7A                    STA $7A
  $6B44  A5 63                    LDA $63
  $6B46  E5 6B                    SBC $6B
  $6B48  85 7B                    STA $7B
  $6B4A  A5 78                    LDA $78
  $6B4C  A6 79                    LDX $79
  $6B4E  85 A7                    STA $A7
  $6B50  86 A8                    STX $A8
  $6B52  20 5C 63                 JSR $635C
  $6B55  18                       CLC
  $6B56  65 6A                    ADC $6A
  $6B58  85 6A                    STA $6A
  $6B5A  8A                       TXA
  $6B5B  65 6B                    ADC $6B
  $6B5D  85 6B                    STA $6B
  $6B5F  38                       SEC
  $6B60  A5 64                    LDA $64
  $6B62  E5 6C                    SBC $6C
  $6B64  85 7A                    STA $7A
  $6B66  A5 65                    LDA $65
  $6B68  E5 6D                    SBC $6D
  $6B6A  85 7B                    STA $7B
  $6B6C  A5 A7                    LDA $A7
  $6B6E  A6 A8                    LDX $A8
  $6B70  85 78                    STA $78
  $6B72  86 79                    STX $79
  $6B74  20 5C 63                 JSR $635C
  $6B77  18                       CLC
  $6B78  65 6C                    ADC $6C
  $6B7A  85 6C                    STA $6C
  $6B7C  49 FF                    EOR #$FF
  $6B7E  85 68                    STA $68
  $6B80  8A                       TXA
  $6B81  65 6D                    ADC $6D
  $6B83  85 6D                    STA $6D
  $6B85  49 FF                    EOR #$FF
  $6B87  85 69                    STA $69
  $6B89  E6 68                    INC $68
  $6B8B  D0 02                    BNE $6B8F
  $6B8D  E6 69                    INC $69
  $6B8F  4C 48 68                 JMP $6848
  $6B92  00 20 80 20 00 21 80 21  .byte $00, $20, $80, $20, $00, $21, $80, $21   ; .  END  .! END !
  $6B9A  00 22 80 22 00 23 80 23  .byte $00, $22, $80, $22, $00, $23, $80, $23   ; ." END ".# END #
  $6BA2  28 20 A8 20 28 21 A8 21  .byte $28, $20, $A8, $20, $28, $21, $A8, $21   ; (  STORE  (! STORE !
  $6BAA  28 22 A8 22 28 23 A8 23  .byte $28, $22, $A8, $22, $28, $23, $A8, $23   ; (" STORE "(# STORE #
  $6BB2  50 20 D0 20 50 21 D0 21  .byte $50, $20, $D0, $20, $50, $21, $D0, $21   ; P  =  P! = !
  $6BBA  50 22 D0 22 50 23 D0 23  .byte $50, $22, $D0, $22, $50, $23, $D0, $23   ; P" = "P# = #
  $6BC2  00 00 00 00 01 01 01 02  .byte $00, $00, $00, $00, $01, $01, $01, $02   ; ........
  $6BCA  02 02 02 03 03 03 04 04  .byte $02, $02, $02, $03, $03, $03, $04, $04   ; ........
  $6BD2  04 04 05 05 05 06 06 06  .byte $04, $04, $05, $05, $05, $06, $06, $06   ; ........
  $6BDA  06 07 07 07 08 08 08 08  .byte $06, $07, $07, $07, $08, $08, $08, $08   ; ........
  $6BE2  09 09 09 0A 0A 0A 0A 0B  .byte $09, $09, $09, $0A, $0A, $0A, $0A, $0B   ; ........
  $6BEA  0B 0B 0C 0C 0C 0C 0D 0D  .byte $0B, $0B, $0C, $0C, $0C, $0C, $0D, $0D   ; ........
  $6BF2  0D 0E 0E 0E 0E 0F 0F 0F  .byte $0D, $0E, $0E, $0E, $0E, $0F, $0F, $0F   ; ........
  $6BFA  10 10 10 10 11 11 11 12  .byte $10, $10, $10, $10, $11, $11, $11, $12   ; ........
  $6C02  12 12 12 13 13 13 14 14  .byte $12, $12, $12, $13, $13, $13, $14, $14   ; ........
  $6C0A  14 14 15 15 15 16 16 16  .byte $14, $14, $15, $15, $15, $16, $16, $16   ; ........
  $6C12  16 17 17 17 18 18 18 18  .byte $16, $17, $17, $17, $18, $18, $18, $18   ; ........
  $6C1A  19 19 19 1A 1A 1A 1A 1B  .byte $19, $19, $19, $1A, $1A, $1A, $1A, $1B   ; ........
  $6C22  1B 1B 1C 1C 1C 1C 1D 1D  .byte $1B, $1B, $1C, $1C, $1C, $1C, $1D, $1D   ; ........
  $6C2A  1D 1E 1E 1E 1E 1F 1F 1F  .byte $1D, $1E, $1E, $1E, $1E, $1F, $1F, $1F   ; ........
  $6C32  20 20 20 20 21 21 21 22  .byte $20, $20, $20, $20, $21, $21, $21, $22   ;     !!!"
  $6C3A  22 22 22 23 23 23 24 24  .byte $22, $22, $22, $23, $23, $23, $24, $24   ; """###$$
  $6C42  24 24 25 25 25 26 26 26  .byte $24, $24, $25, $25, $25, $26, $26, $26   ; $$%%%&&&
  $6C4A  26 27 27 27 03 0C 30 C0  .byte $26, $27, $27, $27, $03, $0C, $30, $C0   ; &'''..0 TAB( 
  $6C52  06 18 60 03 0C 30 C0 06  .byte $06, $18, $60, $03, $0C, $30, $C0, $06   ; ..`..0 TAB( .
  $6C5A  18 60 03 0C 30 C0 06 18  .byte $18, $60, $03, $0C, $30, $C0, $06, $18   ; .`..0 TAB( ..
  $6C62  60 03 0C 30 C0 06 18 60  .byte $60, $03, $0C, $30, $C0, $06, $18, $60   ; `..0 TAB( ..`
  $6C6A  03 0C 30 C0 06 18 60 03  .byte $03, $0C, $30, $C0, $06, $18, $60, $03   ; ..0 TAB( ..`.
  $6C72  0C 30 C0 06 18 60 03 0C  .byte $0C, $30, $C0, $06, $18, $60, $03, $0C   ; .0 TAB( ..`..
  $6C7A  30 C0 06 18 60 03 0C 30  .byte $30, $C0, $06, $18, $60, $03, $0C, $30   ; 0 TAB( ..`..0
  $6C82  C0 06 18 60 03 0C 30 C0  .byte $C0, $06, $18, $60, $03, $0C, $30, $C0   ;  TAB( ..`..0 TAB( 
  $6C8A  06 18 60 03 0C 30 C0 06  .byte $06, $18, $60, $03, $0C, $30, $C0, $06   ; ..`..0 TAB( .
  $6C92  18 60 03 0C 30 C0 06 18  .byte $18, $60, $03, $0C, $30, $C0, $06, $18   ; .`..0 TAB( ..
  $6C9A  60 03 0C 30 C0 06 18 60  .byte $60, $03, $0C, $30, $C0, $06, $18, $60   ; `..0 TAB( ..`
  $6CA2  03 0C 30 C0 06 18 60 03  .byte $03, $0C, $30, $C0, $06, $18, $60, $03   ; ..0 TAB( ..`.
  $6CAA  0C 30 C0 06 18 60 03 0C  .byte $0C, $30, $C0, $06, $18, $60, $03, $0C   ; .0 TAB( ..`..
  $6CB2  30 C0 06 18 60 03 0C 30  .byte $30, $C0, $06, $18, $60, $03, $0C, $30   ; 0 TAB( ..`..0
  $6CBA  C0 06 18 60 03 0C 30 C0  .byte $C0, $06, $18, $60, $03, $0C, $30, $C0   ;  TAB( ..`..0 TAB( 
  $6CC2  06 18 60 03 0C 30 C0 06  .byte $06, $18, $60, $03, $0C, $30, $C0, $06   ; ..`..0 TAB( .
  $6CCA  18 60 03 0C 30 C0 06 18  .byte $18, $60, $03, $0C, $30, $C0, $06, $18   ; .`..0 TAB( ..
  $6CD2  60 03 0C 30 C0 06 18 60  .byte $60, $03, $0C, $30, $C0, $06, $18, $60   ; `..0 TAB( ..`
* $6CDA  A2 00                    LDX #$00
* $6CDC  A9 00                    LDA #$00
* $6CDE  9D 00 20                 STA $2000,X
* $6CE1  9D 00 21                 STA $2100,X
* $6CE4  9D 00 22                 STA $2200,X
* $6CE7  9D 00 23                 STA $2300,X
* $6CEA  9D 00 24                 STA $2400,X
* $6CED  9D 00 25                 STA $2500,X
* $6CF0  9D 00 26                 STA $2600,X
* $6CF3  9D 00 27                 STA $2700,X
* $6CF6  9D 00 28                 STA $2800,X
* $6CF9  9D 00 29                 STA $2900,X
* $6CFC  9D 00 2A                 STA $2A00,X
* $6CFF  9D 00 2B                 STA $2B00,X
* $6D02  9D 00 2C                 STA $2C00,X
* $6D05  9D 00 2D                 STA $2D00,X
* $6D08  9D 00 2E                 STA $2E00,X
* $6D0B  9D 00 2F                 STA $2F00,X
* $6D0E  9D 00 30                 STA $3000,X
* $6D11  9D 00 31                 STA $3100,X
* $6D14  9D 00 32                 STA $3200,X
* $6D17  9D 00 33                 STA $3300,X
* $6D1A  9D 00 34                 STA $3400,X
* $6D1D  9D 00 35                 STA $3500,X
* $6D20  9D 00 36                 STA $3600,X
* $6D23  9D 00 37                 STA $3700,X
* $6D26  9D 00 38                 STA $3800,X
* $6D29  9D 00 39                 STA $3900,X
* $6D2C  9D 00 3A                 STA $3A00,X
* $6D2F  9D 00 3B                 STA $3B00,X
* $6D32  9D 00 3C                 STA $3C00,X
* $6D35  9D 00 3D                 STA $3D00,X
* $6D38  9D 00 3E                 STA $3E00,X
* $6D3B  9D 00 3F                 STA $3F00,X
* $6D3E  E8                       INX
* $6D3F  E8                       INX
* $6D40  E8                       INX
* $6D41  D0 9B                    BNE $6CDE
* $6D43  60                       RTS
* $6D44  C8                       INY
* $6D45  B1 9B                    LDA ($9B),Y
* $6D47  F0 09                    BEQ $6D52
* $6D49  AA                       TAX
* $6D4A  CA                       DEX
* $6D4B  F0 28                    BEQ $6D75
  $6D4D  CA                       DEX
  $6D4E  F0 06                    BEQ $6D56
  $6D50  D0 27                    BNE $6D79
* $6D52  A9 00                    LDA #$00
* $6D54  10 02                    BPL $6D58
  $6D56  A9 FF                    LDA #$FF
* $6D58  8D DD 6C                 STA $6CDD
* $6D5B  AD E0 6C                 LDA $6CE0
* $6D5E  C9 20                    CMP #$20
* $6D60  F0 27                    BEQ $6D89
* $6D62  A9 20                    LDA #$20
* $6D64  A0 00                    LDY #$00
* $6D66  99 E0 6C                 STA $6CE0,Y
* $6D69  C8                       INY
* $6D6A  C8                       INY
* $6D6B  C8                       INY
* $6D6C  18                       CLC
* $6D6D  69 01                    ADC #$01
* $6D6F  C0 60                    CPY #$60
* $6D71  D0 F3                    BNE $6D66
* $6D73  F0 14                    BEQ $6D89
* $6D75  A9 00                    LDA #$00
* $6D77  10 02                    BPL $6D7B
  $6D79  A9 FF                    LDA #$FF
* $6D7B  8D DD 6C                 STA $6CDD
* $6D7E  AD E0 6C                 LDA $6CE0
* $6D81  C9 40                    CMP #$40
* $6D83  F0 04                    BEQ $6D89
* $6D85  A9 40                    LDA #$40
* $6D87  D0 DB                    BNE $6D64
* $6D89  20 DA 6C                 JSR $6CDA
* $6D8C  4C C3 62                 JMP $62C3
* $6D8F  A5 B3                    LDA $B3
* $6D91  18                       CLC
* $6D92  69 46                    ADC #$46
* $6D94  85 B3                    STA $B3
* $6D96  A5 B4                    LDA $B4
* $6D98  49 FF                    EOR #$FF
* $6D9A  18                       CLC
* $6D9B  69 60                    ADC #$60
* $6D9D  85 B4                    STA $B4
* $6D9F  20 B5 6D                 JSR $6DB5
* $6DA2  30 05                    BMI $6DA9
* $6DA4  11 99                    ORA ($99),Y
* $6DA6  91 99                    STA ($99),Y
* $6DA8  60                       RTS
* $6DA9  11 99                    ORA ($99),Y
* $6DAB  91 99                    STA ($99),Y
* $6DAD  C8                       INY
* $6DAE  A9 01                    LDA #$01
* $6DB0  11 99                    ORA ($99),Y
* $6DB2  91 99                    STA ($99),Y
* $6DB4  60                       RTS
* $6DB5  A5 B4                    LDA $B4
* $6DB7  6A                       ROR A
* $6DB8  6A                       ROR A
* $6DB9  29 3E                    AND #$3E
* $6DBB  A8                       TAY
* $6DBC  A5 B4                    LDA $B4
* $6DBE  29 07                    AND #$07
* $6DC0  0A                       ASL A
* $6DC1  0A                       ASL A
* $6DC2  18                       CLC
* $6DC3  79 93 6B                 ADC $6B93,Y
* $6DC6  85 9A                    STA $9A
* $6DC8  A6 B3                    LDX $B3
* $6DCA  BD C2 6B                 LDA $6BC2,X
* $6DCD  79 92 6B                 ADC $6B92,Y
* $6DD0  A8                       TAY
* $6DD1  BD 4E 6C                 LDA $6C4E,X
* $6DD4  60                       RTS
* $6DD5  A5 B3                    LDA $B3
* $6DD7  18                       CLC
* $6DD8  69 46                    ADC #$46
* $6DDA  85 B3                    STA $B3
* $6DDC  A5 B5                    LDA $B5
* $6DDE  18                       CLC
* $6DDF  69 46                    ADC #$46
* $6DE1  85 B5                    STA $B5
* $6DE3  A5 B4                    LDA $B4
* $6DE5  49 FF                    EOR #$FF
* $6DE7  18                       CLC
* $6DE8  69 60                    ADC #$60
* $6DEA  85 B4                    STA $B4
* $6DEC  A5 B6                    LDA $B6
* $6DEE  49 FF                    EOR #$FF
* $6DF0  18                       CLC
* $6DF1  69 60                    ADC #$60
* $6DF3  85 B6                    STA $B6
* $6DF5  A5 B5                    LDA $B5
* $6DF7  38                       SEC
* $6DF8  E5 B3                    SBC $B3
* $6DFA  90 3C                    BCC $6E38
* $6DFC  85 B9                    STA $B9
* $6DFE  A5 B6                    LDA $B6
* $6E00  38                       SEC
* $6E01  E5 B4                    SBC $B4
* $6E03  90 17                    BCC $6E1C
* $6E05  85 BA                    STA $BA
* $6E07  38                       SEC
* $6E08  E5 B9                    SBC $B9
* $6E0A  90 1F                    BCC $6E2B
* $6E0C  4C C6 70                 JMP $70C6
* $6E0F  A9 E9                    LDA #$E9
* $6E11  8D ED 6F                 STA $6FED
* $6E14  A9 03                    LDA #$03
* $6E16  8D EE 6F                 STA $6FEE
* $6E19  4C 4F 6E                 JMP $6E4F
* $6E1C  49 FF                    EOR #$FF
* $6E1E  18                       CLC
* $6E1F  69 01                    ADC #$01
* $6E21  85 BA                    STA $BA
* $6E23  38                       SEC
* $6E24  E5 B9                    SBC $B9
* $6E26  90 E7                    BCC $6E0F
* $6E28  4C 44 70                 JMP $7044
* $6E2B  A9 90                    LDA #$90
* $6E2D  8D ED 6F                 STA $6FED
* $6E30  A9 29                    LDA #$29
* $6E32  8D EE 6F                 STA $6FEE
* $6E35  4C 4F 6E                 JMP $6E4F
* $6E38  A6 B5                    LDX $B5
* $6E3A  86 B3                    STX $B3
* $6E3C  49 FF                    EOR #$FF
* $6E3E  18                       CLC
* $6E3F  69 01                    ADC #$01
* $6E41  85 B9                    STA $B9
* $6E43  A5 B4                    LDA $B4
* $6E45  A6 B6                    LDX $B6
* $6E47  38                       SEC
* $6E48  E5 B6                    SBC $B6
* $6E4A  86 B4                    STX $B4
* $6E4C  4C 03 6E                 JMP $6E03
* $6E4F  A9 00                    LDA #$00
* $6E51  38                       SEC
* $6E52  E5 B9                    SBC $B9
* $6E54  38                       SEC
* $6E55  6A                       ROR A
* $6E56  85 B8                    STA $B8
* $6E58  20 B5 6D                 JSR $6DB5
* $6E5B  85 B7                    STA $B7
* $6E5D  A6 B9                    LDX $B9
* $6E5F  E8                       INX
* $6E60  29 7F                    AND #$7F
* $6E62  C9 18                    CMP #$18
* $6E64  30 1C                    BMI $6E82
* $6E66  F0 15                    BEQ $6E7D
* $6E68  C9 40                    CMP #$40
* $6E6A  30 07                    BMI $6E73
* $6E6C  F0 0A                    BEQ $6E78
* $6E6E  20 D5 6F                 JSR $6FD5
* $6E71  D0 22                    BNE $6E95
* $6E73  20 03 6F                 JSR $6F03
* $6E76  D0 1D                    BNE $6E95
* $6E78  20 35 6F                 JSR $6F35
* $6E7B  D0 18                    BNE $6E95
* $6E7D  20 9C 6F                 JSR $6F9C
* $6E80  D0 13                    BNE $6E95
* $6E82  C9 06                    CMP #$06
* $6E84  30 07                    BMI $6E8D
* $6E86  F0 0A                    BEQ $6E92
* $6E88  20 AD 6E                 JSR $6EAD
* $6E8B  D0 08                    BNE $6E95
* $6E8D  20 9A 6E                 JSR $6E9A
* $6E90  D0 03                    BNE $6E95
* $6E92  20 49 6F                 JSR $6F49
* $6E95  11 99                    ORA ($99),Y
* $6E97  91 99                    STA ($99),Y
* $6E99  60                       RTS
* $6E9A  A5 B8                    LDA $B8
* $6E9C  CA                       DEX
* $6E9D  F0 1A                    BEQ $6EB9
* $6E9F  18                       CLC
* $6EA0  65 BA                    ADC $BA
* $6EA2  B0 1E                    BCS $6EC2
* $6EA4  CA                       DEX
* $6EA5  F0 15                    BEQ $6EBC
* $6EA7  65 BA                    ADC $BA
* $6EA9  B0 22                    BCS $6ECD
* $6EAB  D0 33                    BNE $6EE0
* $6EAD  CA                       DEX
* $6EAE  F0 0F                    BEQ $6EBF
* $6EB0  A5 B8                    LDA $B8
* $6EB2  18                       CLC
* $6EB3  65 BA                    ADC $BA
* $6EB5  B0 1E                    BCS $6ED5
* $6EB7  D0 3D                    BNE $6EF6
* $6EB9  A9 03                    LDA #$03
* $6EBB  60                       RTS
* $6EBC  A9 0F                    LDA #$0F
* $6EBE  60                       RTS
* $6EBF  A9 0C                    LDA #$0C
* $6EC1  60                       RTS
* $6EC2  E5 B9                    SBC $B9
* $6EC4  85 B8                    STA $B8
* $6EC6  A9 03                    LDA #$03
* $6EC8  20 E6 6F                 JSR $6FE6
* $6ECB  B0 E0                    BCS $6EAD
* $6ECD  E5 B9                    SBC $B9
* $6ECF  85 B8                    STA $B8
* $6ED1  A9 0F                    LDA #$0F
* $6ED3  D0 06                    BNE $6EDB
* $6ED5  E5 B9                    SBC $B9
* $6ED7  85 B8                    STA $B8
* $6ED9  A9 0C                    LDA #$0C
* $6EDB  20 E6 6F                 JSR $6FE6
* $6EDE  B0 23                    BCS $6F03
* $6EE0  CA                       DEX
* $6EE1  F0 0D                    BEQ $6EF0
* $6EE3  65 BA                    ADC $BA
* $6EE5  B0 45                    BCS $6F2C
* $6EE7  85 B8                    STA $B8
* $6EE9  A9 7F                    LDA #$7F
* $6EEB  10 24                    BPL $6F11
* $6EED  A9 3C                    LDA #$3C
* $6EEF  60                       RTS
* $6EF0  A9 3F                    LDA #$3F
* $6EF2  60                       RTS
  $6EF3  A9 30                    LDA #$30
  $6EF5  60                       RTS
* $6EF6  CA                       DEX
* $6EF7  F0 F4                    BEQ $6EED
* $6EF9  65 BA                    ADC $BA
* $6EFB  B0 27                    BCS $6F24
* $6EFD  85 B8                    STA $B8
* $6EFF  A9 7C                    LDA #$7C
* $6F01  10 0E                    BPL $6F11
* $6F03  CA                       DEX
* $6F04  F0 ED                    BEQ $6EF3
* $6F06  A5 B8                    LDA $B8
* $6F08  18                       CLC
* $6F09  65 BA                    ADC $BA
* $6F0B  B0 0F                    BCS $6F1C
* $6F0D  85 B8                    STA $B8
* $6F0F  A9 70                    LDA #$70
* $6F11  11 99                    ORA ($99),Y
* $6F13  91 99                    STA ($99),Y
* $6F15  C8                       INY
* $6F16  CA                       DEX
* $6F17  D0 21                    BNE $6F3A
* $6F19  A9 01                    LDA #$01
* $6F1B  60                       RTS
* $6F1C  E5 B9                    SBC $B9
* $6F1E  85 B8                    STA $B8
* $6F20  A9 30                    LDA #$30
* $6F22  D0 0E                    BNE $6F32
  $6F24  E5 B9                    SBC $B9
  $6F26  85 B8                    STA $B8
  $6F28  A9 3C                    LDA #$3C
  $6F2A  D0 06                    BNE $6F32
* $6F2C  E5 B9                    SBC $B9
* $6F2E  85 B8                    STA $B8
* $6F30  A9 3F                    LDA #$3F
* $6F32  20 E6 6F                 JSR $6FE6
* $6F35  A9 40                    LDA #$40
* $6F37  18                       CLC
* $6F38  D0 D7                    BNE $6F11
* $6F3A  A5 B8                    LDA $B8
* $6F3C  65 BA                    ADC $BA
* $6F3E  B0 1B                    BCS $6F5B
* $6F40  CA                       DEX
* $6F41  F0 12                    BEQ $6F55
* $6F43  65 BA                    ADC $BA
* $6F45  B0 1F                    BCS $6F66
* $6F47  D0 30                    BNE $6F79
* $6F49  CA                       DEX
* $6F4A  F0 0C                    BEQ $6F58
* $6F4C  A5 B8                    LDA $B8
* $6F4E  18                       CLC
* $6F4F  65 BA                    ADC $BA
* $6F51  B0 1B                    BCS $6F6E
* $6F53  D0 3A                    BNE $6F8F
* $6F55  A9 07                    LDA #$07
* $6F57  60                       RTS
  $6F58  A9 06                    LDA #$06
  $6F5A  60                       RTS
* $6F5B  E5 B9                    SBC $B9
* $6F5D  85 B8                    STA $B8
* $6F5F  A9 01                    LDA #$01
* $6F61  20 E6 6F                 JSR $6FE6
* $6F64  B0 E3                    BCS $6F49
* $6F66  E5 B9                    SBC $B9
* $6F68  85 B8                    STA $B8
* $6F6A  A9 07                    LDA #$07
* $6F6C  D0 06                    BNE $6F74
* $6F6E  E5 B9                    SBC $B9
* $6F70  85 B8                    STA $B8
* $6F72  A9 06                    LDA #$06
* $6F74  20 E6 6F                 JSR $6FE6
* $6F77  B0 23                    BCS $6F9C
* $6F79  CA                       DEX
* $6F7A  F0 0D                    BEQ $6F89
* $6F7C  65 BA                    ADC $BA
* $6F7E  B0 4C                    BCS $6FCC
* $6F80  85 B8                    STA $B8
* $6F82  A9 7F                    LDA #$7F
* $6F84  10 24                    BPL $6FAA
  $6F86  A9 1E                    LDA #$1E
  $6F88  60                       RTS
* $6F89  A9 1F                    LDA #$1F
* $6F8B  60                       RTS
  $6F8C  A9 18                    LDA #$18
  $6F8E  60                       RTS
* $6F8F  CA                       DEX
* $6F90  F0 F4                    BEQ $6F86
* $6F92  65 BA                    ADC $BA
* $6F94  B0 2E                    BCS $6FC4
* $6F96  85 B8                    STA $B8
* $6F98  A9 7E                    LDA #$7E
* $6F9A  10 0E                    BPL $6FAA
* $6F9C  CA                       DEX
* $6F9D  F0 ED                    BEQ $6F8C
* $6F9F  A5 B8                    LDA $B8
* $6FA1  18                       CLC
* $6FA2  65 BA                    ADC $BA
* $6FA4  B0 16                    BCS $6FBC
* $6FA6  85 B8                    STA $B8
* $6FA8  A9 78                    LDA #$78
* $6FAA  11 99                    ORA ($99),Y
* $6FAC  91 99                    STA ($99),Y
* $6FAE  C8                       INY
* $6FAF  CA                       DEX
* $6FB0  F0 27                    BEQ $6FD9
* $6FB2  A5 B8                    LDA $B8
* $6FB4  18                       CLC
* $6FB5  65 BA                    ADC $BA
* $6FB7  B0 23                    BCS $6FDC
* $6FB9  4C 9C 6E                 JMP $6E9C
* $6FBC  E5 B9                    SBC $B9
* $6FBE  85 B8                    STA $B8
* $6FC0  A9 18                    LDA #$18
* $6FC2  D0 0E                    BNE $6FD2
* $6FC4  E5 B9                    SBC $B9
* $6FC6  85 B8                    STA $B8
* $6FC8  A9 1E                    LDA #$1E
* $6FCA  D0 06                    BNE $6FD2
* $6FCC  E5 B9                    SBC $B9
* $6FCE  85 B8                    STA $B8
* $6FD0  A9 1F                    LDA #$1F
* $6FD2  20 E6 6F                 JSR $6FE6
* $6FD5  A9 60                    LDA #$60
* $6FD7  D0 D1                    BNE $6FAA
* $6FD9  68                       PLA
* $6FDA  68                       PLA
* $6FDB  60                       RTS
* $6FDC  E5 B9                    SBC $B9
* $6FDE  85 B8                    STA $B8
* $6FE0  20 EA 6F                 JSR $6FEA
* $6FE3  4C 9A 6E                 JMP $6E9A
* $6FE6  11 99                    ORA ($99),Y
* $6FE8  91 99                    STA ($99),Y
* $6FEA  A5 9A                    LDA $9A
* $6FEC  18                       CLC
* $6FED  90 29                    BCC $7018
* $6FEF  C9 20                    CMP #$20
* $6FF1  90 03                    BCC $6FF6
* $6FF3  85 9A                    STA $9A
* $6FF5  60                       RTS
* $6FF6  C9 1C                    CMP #$1C
* $6FF8  F0 0D                    BEQ $7007
* $6FFA  18                       CLC
* $6FFB  98                       TYA
* $6FFC  69 80                    ADC #$80
* $6FFE  A8                       TAY
* $6FFF  A5 9A                    LDA $9A
* $7001  69 1B                    ADC #$1B
* $7003  85 9A                    STA $9A
* $7005  38                       SEC
* $7006  60                       RTS
  $7007  98                       TYA
  $7008  C9 80                    CMP #$80
  $700A  18                       CLC
  $700B  10 EF                    BPL $6FFC
  $700D  69 58                    ADC #$58
  $700F  A8                       TAY
  $7010  A5 9A                    LDA $9A
  $7012  69 1F                    ADC #$1F
  $7014  85 9A                    STA $9A
  $7016  38                       SEC
  $7017  60                       RTS
* $7018  69 04                    ADC #$04
* $701A  C9 40                    CMP #$40
* $701C  B0 04                    BCS $7022
* $701E  38                       SEC
* $701F  85 9A                    STA $9A
* $7021  60                       RTS
* $7022  C9 43                    CMP #$43
* $7024  F0 0D                    BEQ $7033
* $7026  38                       SEC
* $7027  98                       TYA
* $7028  E9 80                    SBC #$80
* $702A  A8                       TAY
* $702B  A5 9A                    LDA $9A
* $702D  E9 1B                    SBC #$1B
* $702F  85 9A                    STA $9A
* $7031  38                       SEC
* $7032  60                       RTS
  $7033  98                       TYA
  $7034  C9 80                    CMP #$80
  $7036  38                       SEC
  $7037  30 EF                    BMI $7028
  $7039  E9 58                    SBC #$58
  $703B  A8                       TAY
  $703C  A5 9A                    LDA $9A
  $703E  E9 1F                    SBC #$1F
  $7040  85 9A                    STA $9A
  $7042  38                       SEC
  $7043  60                       RTS
* $7044  A5 BA                    LDA $BA
* $7046  18                       CLC
* $7047  6A                       ROR A
* $7048  85 B8                    STA $B8
* $704A  20 B5 6D                 JSR $6DB5
* $704D  85 B7                    STA $B7
* $704F  A6 BA                    LDX $BA
* $7051  E8                       INX
* $7052  A5 B7                    LDA $B7
* $7054  30 32                    BMI $7088
* $7056  11 99                    ORA ($99),Y
* $7058  91 99                    STA ($99),Y
* $705A  CA                       DEX
* $705B  F0 2A                    BEQ $7087
* $705D  A5 9A                    LDA $9A
* $705F  38                       SEC
* $7060  E9 04                    SBC #$04
* $7062  C9 20                    CMP #$20
* $7064  90 37                    BCC $709D
* $7066  85 9A                    STA $9A
* $7068  A5 B8                    LDA $B8
* $706A  38                       SEC
* $706B  E5 B9                    SBC $B9
* $706D  85 B8                    STA $B8
* $706F  B0 E1                    BCS $7052
* $7071  65 BA                    ADC $BA
* $7073  85 B8                    STA $B8
* $7075  18                       CLC
* $7076  A5 B7                    LDA $B7
* $7078  30 47                    BMI $70C1
* $707A  2A                       ROL A
* $707B  2A                       ROL A
* $707C  30 16                    BMI $7094
* $707E  85 B7                    STA $B7
* $7080  11 99                    ORA ($99),Y
* $7082  91 99                    STA ($99),Y
* $7084  CA                       DEX
* $7085  D0 D6                    BNE $705D
* $7087  60                       RTS
* $7088  C8                       INY
* $7089  A9 01                    LDA #$01
* $708B  11 99                    ORA ($99),Y
* $708D  91 99                    STA ($99),Y
* $708F  88                       DEY
* $7090  A9 C0                    LDA #$C0
* $7092  30 C2                    BMI $7056
* $7094  C9 80                    CMP #$80
* $7096  D0 23                    BNE $70BB
* $7098  C8                       INY
* $7099  A9 03                    LDA #$03
* $709B  10 E1                    BPL $707E
* $709D  C9 1C                    CMP #$1C
* $709F  F0 0B                    BEQ $70AC
* $70A1  18                       CLC
* $70A2  98                       TYA
* $70A3  69 80                    ADC #$80
* $70A5  A8                       TAY
* $70A6  A5 9A                    LDA $9A
* $70A8  69 1B                    ADC #$1B
* $70AA  90 BA                    BCC $7066
  $70AC  98                       TYA
  $70AD  C9 80                    CMP #$80
  $70AF  18                       CLC
  $70B0  10 F1                    BPL $70A3
  $70B2  69 58                    ADC #$58
  $70B4  A8                       TAY
  $70B5  A5 9A                    LDA $9A
  $70B7  69 1F                    ADC #$1F
  $70B9  90 AB                    BCC $7066
* $70BB  A9 C0                    LDA #$C0
* $70BD  85 B7                    STA $B7
* $70BF  30 C7                    BMI $7088
* $70C1  C8                       INY
* $70C2  A9 06                    LDA #$06
* $70C4  D0 B8                    BNE $707E
* $70C6  A5 BA                    LDA $BA
* $70C8  18                       CLC
* $70C9  6A                       ROR A
* $70CA  85 B8                    STA $B8
* $70CC  20 B5 6D                 JSR $6DB5
* $70CF  85 B7                    STA $B7
* $70D1  A6 BA                    LDX $BA
* $70D3  E8                       INX
* $70D4  A5 B7                    LDA $B7
* $70D6  30 32                    BMI $710A
* $70D8  11 99                    ORA ($99),Y
* $70DA  91 99                    STA ($99),Y
* $70DC  CA                       DEX
* $70DD  F0 2A                    BEQ $7109
* $70DF  A5 9A                    LDA $9A
* $70E1  18                       CLC
* $70E2  69 04                    ADC #$04
* $70E4  C9 40                    CMP #$40
* $70E6  B0 37                    BCS $711F
* $70E8  85 9A                    STA $9A
* $70EA  A5 B8                    LDA $B8
* $70EC  38                       SEC
* $70ED  E5 B9                    SBC $B9
* $70EF  85 B8                    STA $B8
* $70F1  B0 E1                    BCS $70D4
* $70F3  65 BA                    ADC $BA
* $70F5  85 B8                    STA $B8
* $70F7  18                       CLC
* $70F8  A5 B7                    LDA $B7
* $70FA  30 47                    BMI $7143
* $70FC  2A                       ROL A
* $70FD  2A                       ROL A
* $70FE  30 16                    BMI $7116
  $7100  85 B7                    STA $B7
  $7102  11 99                    ORA ($99),Y
  $7104  91 99                    STA ($99),Y
  $7106  CA                       DEX
  $7107  D0 D6                    BNE $70DF
* $7109  60                       RTS
* $710A  C8                       INY
* $710B  A9 01                    LDA #$01
* $710D  11 99                    ORA ($99),Y
* $710F  91 99                    STA ($99),Y
* $7111  88                       DEY
* $7112  A9 C0                    LDA #$C0
* $7114  30 C2                    BMI $70D8
* $7116  C9 80                    CMP #$80
* $7118  D0 23                    BNE $713D
  $711A  C8                       INY
  $711B  A9 03                    LDA #$03
  $711D  10 E1                    BPL $7100
* $711F  C9 43                    CMP #$43
* $7121  F0 0B                    BEQ $712E
* $7123  38                       SEC
* $7124  98                       TYA
* $7125  E9 80                    SBC #$80
* $7127  A8                       TAY
* $7128  A5 9A                    LDA $9A
* $712A  E9 1B                    SBC #$1B
* $712C  B0 BA                    BCS $70E8
  $712E  98                       TYA
  $712F  C9 80                    CMP #$80
  $7131  38                       SEC
  $7132  30 F1                    BMI $7125
  $7134  E9 58                    SBC #$58
  $7136  A8                       TAY
  $7137  A5 9A                    LDA $9A
  $7139  E9 1F                    SBC #$1F
  $713B  B0 AB                    BCS $70E8
* $713D  A9 C0                    LDA #$C0
* $713F  85 B7                    STA $B7
* $7141  30 C7                    BMI $710A
  $7143  C8                       INY
  $7144  A9 06                    LDA #$06
  $7146  D0 B8                    BNE $7100
* $7148  A2 2E                    LDX #$2E
* $714A  C8                       INY
* $714B  B1 9B                    LDA ($9B),Y
* $714D  F0 02                    BEQ $7151
* $714F  A9 20                    LDA #$20
* $7151  18                       CLC
* $7152  69 20                    ADC #$20
* $7154  85 A3                    STA $A3
* $7156  BD 93 6B                 LDA $6B93,X
* $7159  29 0F                    AND #$0F
* $715B  05 A3                    ORA $A3
* $715D  9D 93 6B                 STA $6B93,X
* $7160  CA                       DEX
* $7161  CA                       DEX
* $7162  10 F2                    BPL $7156
* $7164  A5 A3                    LDA $A3
* $7166  8D F0 6F                 STA $6FF0
* $7169  8D 63 70                 STA $7063
* $716C  38                       SEC
* $716D  E9 04                    SBC #$04
* $716F  8D F7 6F                 STA $6FF7
* $7172  8D 9E 70                 STA $709E
* $7175  18                       CLC
* $7176  69 24                    ADC #$24
* $7178  8D 1B 70                 STA $701B
* $717B  8D E5 70                 STA $70E5
* $717E  18                       CLC
* $717F  69 03                    ADC #$03
* $7181  8D 23 70                 STA $7023
* $7184  8D 20 71                 STA $7120
* $7187  4C C3 62                 JMP $62C3
  $718A  C8 B1 9B F0 04 A9 51 10  .byte $C8, $B1, $9B, $F0, $04, $A9, $51, $10   ;  +  RETURN  TRACE .. SPEED= Q.
  $7192  02 A9 11 8D A4 6D 8D A9  .byte $02, $A9, $11, $8D, $A4, $6D, $8D, $A9   ; . SPEED= . PLOT  LOMEM: m PLOT  SPEED= 
  $719A  6D 8D B0 6D 8D 95 6E 8D  .byte $6D, $8D, $B0, $6D, $8D, $95, $6E, $8D   ; m PLOT  GOSUB m PLOT  XDRAW n PLOT 
  $71A2  11 6F 8D AA 6F 8D E6 6F  .byte $11, $6F, $8D, $AA, $6F, $8D, $E6, $6F   ; .o PLOT  LET o PLOT  ASC o
  $71AA  8D 56 70 8D 80 70 8D 8B  .byte $8D, $56, $70, $8D, $80, $70, $8D, $8B   ;  PLOT Vp PLOT  END p PLOT  IN# 
  $71B2  70 8D D8 70 8D 02 71 8D  .byte $70, $8D, $D8, $70, $8D, $02, $71, $8D   ; p PLOT  PDL p PLOT .q PLOT 
  $71BA  0D 71 A5 7D F0 08 A9 79  .byte $0D, $71, $A5, $7D, $F0, $08, $A9, $79   ; .q ONERR }.. SPEED= y
  $71C2  A0 00 91 9D 84 7D 4C C3  .byte $A0, $00, $91, $9D, $84, $7D, $4C, $C3   ;  COLOR= . HGR  NORMAL  INPUT }L SPC( 
  $71CA  62 60 60 60 60 60 60 60  .byte $62, $60, $60, $60, $60, $60, $60, $60   ; b```````
  $71D2  60 FF FF FF EF FF FF FF  .byte $60, $FF, $FF, $FF, $EF, $FF, $FF, $FF   ; `.......
  $71DA  FF FF FF FF FF 65 FF FF  .byte $FF, $FF, $FF, $FF, $FF, $65, $FF, $FF   ; .....e..
  $71E2  67 FF FF FF FF FF FF FF  .byte $67, $FF, $FF, $FF, $FF, $FF, $FF, $FF   ; g.......
  $71EA  FF FF FF FF FF A5 FF FF  .byte $FF, $FF, $FF, $FF, $FF, $A5, $FF, $FF   ; ..... ONERR ..
  $71F2  FB FF FF FF FF FF FF FF  .byte $FB, $FF, $FF, $FF, $FF, $FF, $FF, $FF   ; ........
  $71FA  EF FF FF FF FF E6 00 00  .byte $EF, $FF, $FF, $FF, $FF, $E6, $00, $00   ; ..... ASC ..
  $7202  9A 80 00 00 02 02 00 00  .byte $9A, $80, $00, $00, $02, $02, $00, $00   ;  SHLOAD  END ......
  $720A  9A 00 00 00 00 92 00 00  .byte $9A, $00, $00, $00, $00, $92, $00, $00   ;  SHLOAD .... HCOLOR= ..
  $7212  9A 80 00 00 00 02 00 00  .byte $9A, $80, $00, $00, $00, $02, $00, $00   ;  SHLOAD  END ......
  $721A  90 00 00 00 00 12 00 00  .byte $90, $00, $00, $00, $00, $12, $00, $00   ;  HGR2 .......
  $7222  9A 88 00 00 02 12 00 00  .byte $9A, $88, $00, $00, $02, $12, $00, $00   ;  SHLOAD  GR ......
  $722A  9A 00 00 00 00 12 00 00  .byte $9A, $00, $00, $00, $00, $12, $00, $00   ;  SHLOAD .......
  $7232  9A 92 00 00 90 02 00 00  .byte $9A, $92, $00, $00, $90, $02, $00, $00   ;  SHLOAD  HCOLOR= .. HGR2 ...
  $723A  92 00 00 00 00 9A 00 00  .byte $92, $00, $00, $00, $00, $9A, $00, $00   ;  HCOLOR= .... SHLOAD ..
  $7242  9A 10 00 00 00 00 00 00  .byte $9A, $10, $00, $00, $00, $00, $00, $00   ;  SHLOAD .......
  $724A  90 00 00 00 00 12 00 00  .byte $90, $00, $00, $00, $00, $12, $00, $00   ;  HGR2 .......
  $7252  9A 00 00 00 00 00 00 00  .byte $9A, $00, $00, $00, $00, $00, $00, $00   ;  SHLOAD .......
  $725A  98 00 00 00 00 1A 02 00  .byte $98, $00, $00, $00, $00, $1A, $02, $00   ;  ROT= .......
  $7262  9A 90 00 00 00 00 00 00  .byte $9A, $90, $00, $00, $00, $00, $00, $00   ;  SHLOAD  HGR2 ......
  $726A  98 00 00 00 00 1A 00 00  .byte $98, $00, $00, $00, $00, $1A, $00, $00   ;  ROT= .......
  $7272  9A 00 00 00 00 00 00 00  .byte $9A, $00, $00, $00, $00, $00, $00, $00   ;  SHLOAD .......
  $727A  00 00 00 00 00 32 FF FF  .byte $00, $00, $00, $00, $00, $32, $FF, $FF   ; .....2..
  $7282  FF FF FF FF FF FF FF FF  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF   ; ........
  $728A  FF FF FF FF FF FF FF BF  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $BF   ; ....... NEW 
  $7292  FF FF FF FF FF FF FF FF  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF   ; ........
  $729A  FF FF FF FD FF FD FF FF  .byte $FF, $FF, $FF, $FD, $FF, $FD, $FF, $FF   ; ........
  $72A2  FF FF FF FF FF FF FF FF  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF   ; ........
  $72AA  FF FF FF FF FF EF FF FF  .byte $FF, $FF, $FF, $FF, $FF, $EF, $FF, $FF   ; ........
  $72B2  FF FF FF FF FF FF FF FF  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF   ; ........
  $72BA  FF FF FF FF FF FD FF FF  .byte $FF, $FF, $FF, $FF, $FF, $FD, $FF, $FF   ; ........
  $72C2  FF FF FF FF FF FF FF FF  .byte $FF, $FF, $FF, $FF, $FF, $FF, $FF, $FF   ; ........
  $72CA  EF 7F FF FF FD 6D FF FF  .byte $EF, $7F, $FF, $FF, $FD, $6D, $FF, $FF   ; .....m..
  $72D2  FF 7F FF FF FF FF FF FF  .byte $FF, $7F, $FF, $FF, $FF, $FF, $FF, $FF   ; ........
  $72DA  FF FF FF FF FD 6D FF FF  .byte $FF, $FF, $FF, $FF, $FD, $6D, $FF, $FF   ; .....m..
  $72E2  FF 6F FF FF FF FF FF FF  .byte $FF, $6F, $FF, $FF, $FF, $FF, $FF, $FF   ; .o......
  $72EA  FF FF FF FF FD 6D FF FF  .byte $FF, $FF, $FF, $FF, $FD, $6D, $FF, $FF   ; .....m..
  $72F2  FF 6F FF FF FD FF FF FF  .byte $FF, $6F, $FF, $FF, $FD, $FF, $FF, $FF   ; .o......
  $72FA  FF 7F FF FF ED ED        .byte $FF, $7F, $FF, $FF, $ED, $ED   ; ......
