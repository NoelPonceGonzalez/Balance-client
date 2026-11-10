const SHOT = 'https://s.csfloat.com/m/';
const STEAM = 'https://community.cloudflare.steamstatic.com/economy/image/';

interface SkinPicture {
  shot: string;
  steam: string;
}

/** Foto de CSFloat y, si esa no llega, el icono de Steam. */
const ART: Record<string, SkinPicture> = {
  'awp dualidad': { shot: '2590592282269110901', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf-jFk7uW-V6hkLfKcMXSewOVzj-1gSCGn20p_62-HnN7_cH-XblQjDZYhR-FZsETqmoXjYry2s1DX3d5AyyT62ipXrnE8bpg5yZk' },
  'desert eagle aliento de fuego': { shot: '2085698316685529526', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk6_evb6hoH_aaHGKS0-t3pOlgQS6MmRQguynLn9ircSiTPFUgCJAkQbELsxXtktDkMurk4lTZ39hEyn_-3HsbvXxj4fFCD_RcNNN-xQ' },
  'five seven polimero oscuro': { shot: '4312649747517978944', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3l4Dl7idN6vyRbq17JeOWGGKe_v55vPhkSjuMkRw1uAKJk4jxNWWVaw9yAsF3R-cItkTqx9HiY-23tFeN3oNFyS_9jn4a5i5o5b0AB6B35OSJ2MsRWanJ' },
  'glock 18 espectros': { shot: '6173358517456843270', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1c_M2pZKtuK6HLMXCCwPp-qfJWQyC0nQlp4T_Xnoz8dCmfZlUgXsd5RbMC40WxkdXnP7nl4wHXi9oUyH_9jilIuzErvbjBKaM58A' },
  'm4a1 s loto negro': { shot: '508530052388110880', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_ux6seJicCW8gQg0jDWAm5ngbynCalJyDpMlQONYtkPpldTlYr7qtAPc2NhByiX4jikav3tj5O4LU6A7uvqArAmeAQg' },
  'm4a4 magnesio': { shot: '2868312477545355687', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiVI0P_6afBSI_icHneV09FxuO56Wxa_nBovp3OAzo2vdHPFPFUmCJRxRbNZ4xewx9W1Nb7j4gzXg99Ayy73iC1Aun1q_a9cBiEfMG3G' },
  'mac 10 saiba oni': { shot: '8768344882101191238', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1W7vH_OJtiOvGYB1icyOl-pK89HXuxkRt2627Syt2udn6TZlJyW5R0QuMKsRm6lNflNO3g7lfbi49H02yg2Yk7YeQ4' },
  'p250 rayos x': { shot: '593911978506726749', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhzMOwwiFO0Oq8ab1SMKLGXlicyOl-pK8_HSjjxx9wsmXQnIv6cH2TaAQoWZd4RuAKshe7wdS1NOvi5VCIi48Q02yg2fSIc8-4' },
  'usp s fallo en espiral': { shot: '8845724442479751326', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSNeODHViD0edkse1WSCW6gR4vjDSXk4v8MijCMEJPV8ckHKJXrBexkofnY-Ln4AGP3thGyH39j3hAuyw-5OYHV6YsrqCBi1zBOb1otMIdZKHwDuw2Sjo' },
  'bayoneta m9': { shot: '7263493498917127351', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2jMZtvIemcAGKEj7ojtOIwSnrrkEt25WiEw438cXuUaQB0WcBxFrUItxa6lNezMOKzsVPAy9USYWigJ8Q' },
  'guantes nocts': { shot: '8763865681354958243', steam: 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk5UvzWCL2kpn2-DFk_OKherB0H_qSCXKR09F7teVgWiT9k08l5WrVnNeuI3qRaAEmCZJ0FuRYsRDsm9LnMryw71HfiooUmSn9hzQJsHg51Ex1iQ' },
};

ART['awp duality'] = ART['awp dualidad'];
ART['desert eagle firebreathing'] = ART['desert eagle aliento de fuego'];
ART['five seven dark polymer'] = ART['five seven polimero oscuro'];
ART['glock 18 wraiths'] = ART['glock 18 espectros'];
ART['m4a1 s black lotus'] = ART['m4a1 s loto negro'];
ART['m4a4 magnesium'] = ART['m4a4 magnesio'];
ART['p250 x ray'] = ART['p250 rayos x'];
ART['usp s spiral glitch'] = ART['usp s fallo en espiral'];
ART['m9 bayonet'] = ART['bayoneta m9'];
ART['sport gloves nocts'] = ART['guantes nocts'];

const WEAR_TAIL = /\s+(fn|mw|ft|ww|bs|factory new|minimal wear|field tested|well worn|battle scarred)$/;

function foldSkin(label: string): string {
  return label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function picture(label: string): SkinPicture | null {
  const folded = foldSkin(label).replace(/\s+a la venta(\s+por debajo de.*)?$/, '');
  return ART[folded] || ART[folded.replace(WEAR_TAIL, '')] || null;
}

export function skinArt(label: string): string | null {
  const row = picture(label);
  return row ? `${SHOT}${row.shot}/playside.png` : null;
}

export function skinArtSteam(label: string): string | null {
  const row = picture(label);
  return row ? `${STEAM}${row.steam}` : null;
}
