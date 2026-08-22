// server.js - API REST de PDFmania (Postgres / Supabase)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const _seenMsgIds = new Set(); // dedup de webhooks de WhatsApp (ids de mensaje ya procesados)
const { pool, q, one, many, init, seed, COUNTRIES, CATALOG } = require('./db');
let webpush = null; try { webpush = require('web-push'); } catch (e) { console.warn('web-push no instalado; notificaciones desactivadas'); }
// Íconos de la app (PWA) en base64
const ICON192_B64='iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAAIVklEQVR4nO3dTWtTTRQH8ElrQGt9KRSslW5aP0AWokIFK1iwha6sfgQ3QjfFjfuKC12ouCj6BSzUvUGjLrrRQrOKFK0viCFiF43vMal5FuG5hPTeeO+8nDkz9//bPtzcM2f+nZmbxDxCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxjO0CuGg2m0kvyWTQvbQGSCIucaQwUikasKHQRElJmDwfJHFoongcJj8HxiQ3O/mXJN/GwzY67XyKkScjcSI3O3mQJOcHoCs6EnNp8dZ8OFy6yvwZmjOGJZnmZNFy80Q8Q04Uqc6xckXyibE+Jc4VnIhLtSaaCYbT4Hr9odyoUiTpPvPWezOQFgdK9KzjLd4MinVxInajmXc5igej41uZiNdfzs2NyelhMi3L6Z7KcXTI7AoSMVrJsI+6ODf2HtsFdHKug3r9c3TcPvXjFaCUp6fFrQwxmo/ufUlDdDo40RAuK5ATzSLWfdRM1iEWAUJ6ovDPkP256dKFNEenA9suWV6B2PaFmy7dsLsO2QwQ0pMIzwxZCxDSI4FhhuwECOmRxi1DLJ7CAkhPHKy6ZCFAUX8orPrCXFSv6Bch6gBxeOvCb8QdJg0Qjj4aMTkMsTgDIT1yOPSNLkA4+phg/TBEFCAcfejR9NzyFoblR53/n4Vh8zLN4kZmPEBIDw1bGdpl9NXp5XK5tbU1Qy9er9d///5dq9Wq1WqlUqlUKh8+fCiVSqVSqVgs/vr1y9B9OTMbIM+Wn2w2m81m9+3bNzg4ODY21v6f/vz58/Lly6dPny4vLxeLRSvlZTKZ0IY3m01HGy6aEczdMZfLRd2UzPr6+pUrV/bv329umFGiSqKvRAMrg+EQoJZqtbqwsNDf3290vDtF1UNchgZWRsInQC2fPn2anZ01OuQOUZVQ1qCBrWFwC1DL4uLi7t27TY89EFWGiXux+CzMe5cuXXr8+PGBAwdsF6IfaYBcfRbQYXx8/NmzZwcPHiS4F2WfjQTI0Grpulwut7S0tGuXtffeTMwL3QqU5uUnMDk5ubCwQHAjsm7rDxCWn+7m5+ePHTtm6+7aZ4doBcLyE+jt7b179y7BjWh6jqcwC44fPz41NWW7Cj00B8jR/WtjYyPTVX9//8jIyIkTJ+bm5h4+fFiv1xXvOD8/r6VyCazniOz9qyhybyS+efMm0V2Gh4dv37799+9fiXu1bG9vHz582FAT2pmeEWxhMsrl8tzc3Llz5759+yb3Cj09PefPn9dblRUIkLx8Pj87O9toNOQuP336tN56rNAZoNC10e/nr3w+f+vWLblrT506pbeYUKH917iLYQVSdf369R8/fkhcODQ0NDAwoL0eYgiQqs3NzUKhIHft6Oio3mLoIUAaPHnyRO7CkZERvZXQ0xagFB6AAu/evZO7cO/evXorCWX0GIQVSIMvX77IXUgTIKMQIA16eiTbSPwuqwkIkAaDg4NyF/78+VNvJfQQIA2kH6a+f/+utxJ6CJAGZ8+elbvw48ePeiuhpydAaX4EO3To0JkzZ+Suffv2rd5ioph7EMMKpOrq1at79uyRuLBcLm9tbekuhxoCpGR6evry5cty166srOgtxgoESN7U1NSDBw96e3vlLn/+/Lneehxm+ltL8dF8oezIkSN37txR+UJZo9EYGhoy1IRQhubIt98HMqSvr29gYGB4ePjkyZMTExMzMzPZbFblBQuFQqVS0VWeRQiQEEKMjY0RL5k3b96kvJ05OANZ8OLFi0ePHtmuQg8EiNr29rb0gxtDCBC1GzdurK6u2q6CGUMnfAk8fx8okM/nbf24Qmg96i+LFYhOsVi8ePGi9L/i4AkBIrKysjIxMeHBZxcdECAK9+7dm5ycrFartgvhytD+KoHbGahcLl+4cMFKKzqElme7qP/xKY5PgL5+/Xrt2jX6n/mNElqk+svinWj9Xr9+ff/+/cXFxTTsWXoCFPoj+013f2E/uXq9vrq6WigUlpeXzf3POqSFLjZaZgcrUAKNRqNWq9Vqta2trc+fP1cqlffv37969apUKq2trXnwDXkJCJAQQmxsbBw9etR2FU7CYzwoQYBACQIESrQFyPQPGYE0c49gAisQKEKAQAkCBEp0BgjHIIaMHoAEViBQhACBEooAYRezhaDzmgOUno/f3aV3jrCFgRKiAGEXo0fTc/0Bwi7GmfbZodvCsAhRIuu2kQBhEeLJxLyQHqKxCNGg7DOewkCJqQBFrZZYhEyL6rChcwVWIFBiMEBYhOgRLz8CKxAoMv68Tf83kVpWWo0VCJQYDxBOQjRsrfQUKxAyZJrFc4LlLQwZUme3h0QBwpGZHk3P6VYgbGQmWH/IZfEUhgzJ4dA30gB1+bPg0Au3dOkY5YGBegXCYcg04g5b2MJwGFJn/egTYHEGCiBDcbDqkp0A4TAkjcnRJ2BtBUKGJHBLj7C7hSFDiTBMj7B+BkKGYuKZHkHwfaA4umcl5U/+zJvD4imsexfSvBQxT49gEiCBDIXhnx7BZAsL/DMoTLpmmkN94LICtfyzL2lYihxKj+AWIJH6DLmVHsFtCwvESQm3VipydMjsCmrnaE+TcnqYTMsKxNyw2Pa3Ow9Gx7eyQPxDD+dGd/BmUKyLa+dNx70ZSIsDJQYSPX8x7L7r9Ydyo8p2SR/jrc+EcwUn4lKtAbm3gognxoki1TlWbjuVdxQNzRPDkkxzsuh2ut6Ylpg/i7fmw+HS2zn6+YbT0WlxfgAdnEiSB7kJ+DOSdmxj5FN0WnwbTwcmSfIvNwFvB7YTcZg8Dk27VAxyJ0NhSklo2qVuwFEkIpXCuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAe/wE6tUoXKt4H4wAAAABJRU5ErkJggg==';
const ICON512_B64='iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAYQElEQVR4nO3dfayWdf0H8PsAiojL4QxGKqA1Khrglou1sIeFTZvONlgtVypho7XW0hVLcss/sjncMGs9jXBSs7H1gG0tl1A2TWFoc7jiUEjy3FSOyMZBkAP8/sDfyQ435+m+ruv79Hr9mU0/u7+fz+d9fa/7cGi1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEZ0hS4AanHq1Klq/4VdXYaF3OhpklT5fu+chCA5WpbYRbjrh08qEDPdSXSS3viDkwdERTsSXsYbf3DygLD0H2EUu/TPRhjQPD1Hcyz9YRIGNEOfUS9Lv0PCgProLWph71dOElA5LUVlLP3GCAMqoY3olL0fkCSgE7qH0bP6IyEGGB19w4jZ+9GSBIyIdmG47P2ESAKGQ5cwNKs/UWKAwekPzsrez4YkoC1tQRtWf5bEAANoCP6H1Z89MUA/rcCbrP6iiAFaAoCW1V8wMVA4x1+uvPd+5avNx0V+nHqJstllkawtnyeJct7FSXRbJbebfM7Ez2EXJK2VlNkm8uETIcdchCS2T1FLx4kQAwecucgXjRXTckaE42izFe1asVAG4dRokkPNU4R7xAYZESdIA5xobqJaHFZGJZwpNXGW+YhnTdgRNXHEVMspZiKS1WAvNMBZUxVHmLwY1oFdEISjp0MOL21hV4Dhj4Q2YHScXKrMPANoCUbKmSUp4Kib88jpDYbPgSUm1Hib7eRoFYbkqFISZKTNc9L0DINwTslofpKNcTY0D205pASYXiqhkRjA8cSu4aE1sdnTUfRzNlFrclYNalG0Fi0BEC3zSQO0WeEcSYwaG0szSUu/FWxM6AIYyDTSsMY6IYZfXsRbWQFxaWZCrH7a0n6lcRKxMHtEQiuWwyugKBg54tFMn3gdFAMbIbwGJsHqZxR0ZvZ8+oHVPWMGjA5p0Yx5BRSS0SJ+dXeRd0EBWRDB1Nr3Vj+V07H58aEH4MGfRGndzHgF1DQjRLq8DsqMZdEol2jyoJPz4AbQHDNDNmrtN/eAxgiAhtj+ZEYGZMDiaEJ93Wz1E5z2TpcbQO2MB3mrrw/dA+omAOpl+1MCGZAoS6RGNfWu1U+09Hxa3ADqYhIoUE396R5QEwFQC9ufYsmAhAiA6tn+FE4GpEIAVMz2h5YMSIQASIDtT4r0bfycUJUqfzwxQmTAXETLDaAyuhzaqryTvQiqigCohu0Pg5ABcRIAFbD9YUgyIEICoFO2PwyTDIiNAOiI7Q8jIgOiIgAiYvtTAn0eDwEwetU+epgKylFtt7sEjJoAGCXbHzohA2IgAEbD9ofOyYDgBMCI2f5QFRkQlgAIyfYHUxCQABiZCh8x9D2cVuEsuASMiAAYAb0F8TOnwycAhsurf6iPLwOCEAAB2P5wJnPRPAEwLF79QwN8GdAwATA02x8aIwOaJACGYPtDw2RAYwRAQ2x/GD7z0gwBMBiPD5A6UzwIAXBWXv5AQF4ENUAA1M72h9ExO3UTAO1V9cigg6ETVU2QS0BbAqANvQL5MddnEgA18vgPnTNH9REAA3n5A7HxIqgmAuB/2P4QJxlQBwEAUCgB8F8e/yFmLgGVEwAVs/2hPuarWgLgTZU8FOhOqFslU+YScJoAaLV0A5TH1LcEQIU8/kMzzFpVBICXP5AeL4IqIQAAClX6c6vH/+G7++67v/3tb4euolF9fX0nTpzo6+vr6+t7/fXXe3t7Dx8+3Nvbe+jQoZ6enp6engMHDrz88sv79u3bu3fv3r17e3p6QpdcFvPboXGhC4B4jRs3bty4cePHj2+1WhdeeOGQ///e3t4XXnhh+/bt27dv7+7u3rJlS3d39/Hjx+uvFEaj6ADw+EC1Jk6cOHfu3Llz5/b/L8ePH+/u7t68efPGjRs3bty4bds2750r1NXV1fnneerUqWKnuOgA6FyxfcMwnXPOOXPmzJkzZ85tt93WarVeffXVP//5zxs2bNiwYcOOHTtCV5eDSjKgWOUGgKaheRdddNGiRYsWLVrUarW2bdu2bt26devWPfvss7oxrGIvAYX+FJCXPwT3nve8584779y8efOLL774ne98593vfnfoilLlR0JHrdAAgHhMnz79W9/61rZt2zZt2nTzzTef/s4ZGlBiAHj8J07z5s1bs2bNnj177rnnnsmTJ4cuJyUuAaNTYgB0zvanPm9/+9uXL1++c+fOBx544NJLLw1dTjJM5SgIAIjRhAkTvvrVr77wwgv33XffpEmTQpdDnooLgM5veR40aMz48eO//vWv79ix42tf+9rYsWNDlxO7zmeztLdAxQUAJGfSpEn333//s88+O2/evNC1kJWyAsDjP+m68sorn3766ZUrV/oxoUG4BIxIWQEASRszZsztt9/+t7/97corrwxdCzkoKAA8/pOH973vfZs2bTr9uyU4k0vA8BUUAJCN8ePHr1q16mc/+5nXQXSilADw+E9+lixZ8thjj/kh0TO5BAxTKQEAWfrwhz/817/+ddq0aaELIUlFBIDHfzI2a9asJ5988oorrghdSFxcAoajiACAvE2bNu0vf/nLO9/5ztCFkBgBMDSP/8Tvsssu+9Of/jR16tTQhUTE5A4p/wAo4R4HrVZr+vTpjz766Nve9rbQheQj++2RfwB0yEMECZk7d+6vf/1rvzWon/kdXOYBkH2AwwDXXHPNd7/73dBV5CPvHZJ5AECBli1btnDhwtBVkAABMBj3RxK1atWqSy65JHQVUTDFg8g5APK+u8EgJk2a9NBDD9l9lch4k+QcAB0yPCRtwYIFfmHcaWb5bAQAZOvee++9+OKLQ1dBvLINgA5vbR4ZyMBFF1107733hq4iCh1OdK5vgbINAKDVai1evHjWrFmhqyBSeQZArnENIzVmzBh/LKASWW6VPAOgQ97/kJMbb7zx/e9/f+gqwjPXZxIAkL9ly5aFLoEYZRgAWd7UoBMLFy68/PLLQ1eRvPx2y7jQBUTHPTEVa9asufXWWyv8F44ZM+a8/zdlypSpU6dOnTp15syZs2fPnj179qWXXlrhf6thY8eO/fKXv/yNb3wjdCGBdXV15bfEOyEA4E0nT548cuTIkSNHWq3W/v37n3vuubf+02nTpi1YsGDBggU33HDDBRdcEKjG0bv55puXL19+/Pjx0IUQkQxfAXXC4z9ns3v37gcffPCmm26aMmXK5z73uSeeeCJ0RSMzefLk66+/PnQV4Znxt8otANzvqNuRI0cefvjhj3zkI/Pnz//jH/8YupwRuOmmm0KXkLzMNkxuAQCNeeqpp6699tpPfepTe/bsCV3LsFx33XUTJkwIXQUREQD/5W7IKPzud7+bNWvW2rVrQxcytIkTJ1577bWhqwjPpPfLKgAyu52RisOHD3/2s5+94447Tp48GbqWIXzyk58MXULyctozWQUABHT//fcvXrw48gxYsGBB6BKIiACAyvz85z9fsmRJ6CoGM2PGjHe9612hqyAWAuBNXgtSiYceemjlypWhqxjM/PnzQ5cQnnk/LZ8AyOnFHElbtmzZ008/HbqKs/rABz4QuoTkZbNt8gkAiMSJEyeWLl3a19cXupD2BAD9BECr5T5I1f7+979///vfD11Fe7Nnzx47dmzoKsIz9S0BADVZsWLF0aNHQ1fRxrnnnnvFFVeEroIoZBIA2bySIxsvvfTSmjVrQlfR3nvf+97QJSQvj52TSQBAhFavXh26hPZmzpwZugSiIAC8CqQuzzzzzM6dO0NX0cZll10WuoQomH0BADV65JFHQpfQRtJ/uQ0VyiEA8ngZR5aeeuqp0CW0IQAqkcHmySEAIFpx/omwiy++OHQJRKH0APASkFrt37+/p6cndBUDTZo0KXQJsSh8A5QeAFC3Xbt2hS5hoAsvvLDwxcdpAgDq9eKLL4YuYaAxY8ZMnDgxdBWEl3wAZPA9DHmL8BVQq9U699xzQ5eQg9T3T/IBAJE7cuRI6BLaOOecc0KXQHhFB4DXoDSgt7c3dAltuAH0K3kPFB0A0IAxY2KcstTfXVCJGFsTcnL++eeHLqGN48ePhy6B8NIOAE8xxC/OAHjjjTdCl5CJpLdQ2gEA8Zs8eXLoEtoQALRKDoCSv/mhSTNmzAhdwkB9fX1xfjUdSrHboNwAgGZEGACHDh0KXQJREABQo8svv/zCCy8MXcVAr732WugSiIIAgBp98IMfDF1CG6+88kroEoiCAIAaXX311aFLaGPv3r2hSyAKCQdA0j99RQnGjBlz4403hq6iDQFQrXR3UcIBAJGbP3/+1KlTQ1fRxu7du0OXQBQKDYBif+qLJi1dujR0Ce3961//Cl1CdMrcCYUGANRt+vTpn/70p0NX0V53d3foEoiCAIBa3HXXXePGjQtdRRtHjx7duXNn6CqIggCA6s2bN2/JkiWhq2hvy5YtJ0+eDF0FURAAULHx48f/9Kc/jfad8jPPPBO6BGIhAKBiP/rRj+bOnRu6irPavHlz6BKIhQCAKt1+++1f+MIXQlcxmCeffDJ0CcRCAEBlvvKVr6xcuTJ0FYPZsWOHb4DpJwCgAl1dXXffffcPfvCD0IUMYcOGDaFLICIx/pjacHTyZ6+j/XaORE2aNGnNmjU33HBD6EKG9oc//CF0CfHq6uoa9WI5depUiovFDQA68pnPfKa7uzuJ7X/48OHHHnssdBVERADAKH3sYx97/PHH165dO2XKlNC1DMvvf//7o0ePhq6CiKT6CghCueCCCxYuXLh06dI4f9f/IH75y1+GLoG4CAAYlhkzZixYsOCaa665/vrrzz///NDljNh//vOfRx99NHQVxEUAwJu6urrOO++88847b8KECZMnT546deo73vGOmTNnzp49e86cOZdccknoAjuyZs2avr6+0FUQFwFAqm655ZZbbrkldBVp6Ovr+8lPfhK6CqLjS2DI369+9atdu3aFroLoCADI33333Re6BGIkACBzv/3tb5977rnQVRAjAQA5O3HixF133RW6CiIlACBnDz74oL8AkrMRAJCtnp6eO++8M3QVxEsAQLa++c1v9vT0hK6CeAkAyNP69etXr14dugqiJgAgQwcPHly8eHEnvzWdEggAyNAXv/jFffv2ha6C2AkAyM2KFSt+85vfhK6CBAgAyMqGDRuWL18eugrSIAAgH88///yiRYtOnDgRuhDSIAAgE7t27bruuusOHToUuhCSIQAgB3v27Pn4xz++f//+0IWQEgEAydu9e/dHP/rRHTt2hC6ExAgASFt3d/fVV1/973//O3QhpEcAQMKeeOKJD33oQ7t37w5dCEkSAJCq1atXf+ITnzh48GDoQkiVAID0HDt2bOnSpbfddtuxY8dC10LCUv1L4bu6ukb9e05OnTrV1dVVbT3QmH/84x+f//zn/SVflevkVyclulLcACAZp06d+t73vnfVVVfZ/lQi1RsAlGbLli1f+tKXNm3aFLoQ8uEGALF77bXX7rjjjquuusr2p1puABCvY8eO/fCHP7znnnteffXV0LWQIQEAMXr99ddXr169YsWKPXv2hK6FbAkAiMuBAwdWrVr1wAMPvPTSS6FrIXMCAGKxefPmH//4x2vXrj169GjoWiiCAIDAdu/e/fDDD//iF7/o7u4OXQtlKTQA/FkwgvvnP//5yCOPrFu3bvPmzf729uDKPIJCAwCCOHjw4OOPP75+/fr169f77c0El3AAdPLbIKAZfX1927Zt27x588aNGzdu3Lh161ZNm590XyckHAAQmyNHjuzYsWP79u3bt2/funXr888/v3Xr1jfeeCN0XdCeAICzOvH/jh8/fvTo0d7e3sOHD/f29h46dKinp6enp+fAgQMvv/zyvn379u7du3fv3ldeeSV0yTACAoBUrVmz5tZbbw1dBSTM7wICKFS5AeC7OOC0YrdBuQEAULi0AyDdn74C8pD0Fko7AAAYNQEAUKiiA6DYb36AfiXvgaIDAKBkyQdA0t/AAElLff8kHwAAjI4AAChU6QFQ8vc/QOEboPQAAChWDgGQ+vcwQIoy2Dw5BAAAoyAASn8JCMUy+wIAoFCZBEAGL+OAhOSxczIJAABGSgC0Wl4FQnlMfUsAABQrnwDI45UcEL9stk0+AdAh90Eoh3k/TQAAFEoAABQqqwDI5sUcEK2c9kxWAdAhrwWhBCa9nwAAKFRuAZDT7QyITWYbJrcA6JC7IeTNjL+VAAAolAAYyAMC5Mp0D5BhAGT2kg6IRH67JcMAAGA4BEAb7omQH3N9pjwDIL+bGhBWllslzwAAYEjZBkCHce22CDnpcKKzfPxvZRwAAAxOAJyVSwDkwSyfTc4BkOutDWhSxpsk5wDonAcHSJ0pHoQAAChU5gGQ8d0NaEDeOyTzAOic+yOky/wOLv8AyDvAgfpkvz3yD4DOeYiAFJncIQkAgEIVEQCd3+M8SkBaOp/Z7N//tAoJAADOVEoAuARAOTz+D1MpAQDAAAUFgEsAlMDj//AVFAAAvFVZAeASAHnz+D8iZQUAAP2KCwCXAMiVx/+RKi4AADhNAIyGSwDExlSOQokBUMktT7dBPCqZx9Le/7TKDAAAWsUGgEsAZMPj/6gVGgCtUs8bOFOx26DcAKiESwCEZQY7UWju9XN5hHSZ3w65AQAUqvQA8G0wJMrjf+dKDwCAYgkAlwBIj8f/SgiAysgAaIZZq4oAaLU8CEB5TH1LAPTzIgiS4OVPhQRAxWQA1Md8VUsA/FdVDwV6FOpQ1WR5/O8nAAAKJQD+h0sAxMnjfx0EwEAyAGJj+9dEANRIBkDnzFF9BEAbHhMgP+b6TAKgPS+CIAZe/tRKANROBsDomJ26CYCzqvCRQR/DSFU4NR7/z0YADEbfQOpM8SAEQENcAmD4zEszBMAQvAiChnn50xgBMDQZAI2x/ZskAIZFBkADbP+GCYAAZACcyVw0TwAMV7UPFHod3qraifD4P0wCYAR0FcTPnA6fABgZXwZA5bz6D0UAhCQDwBQEJABGzJcBUBWv/sMSAKMhA6Bztn9wAmCUZAB0wvaPgQAYPRkAo2P7R0IAREQGUAJ9Hg8B0JHKHz3MBnmrvMM9/ndCAHRKBsAw2f6xEQAVkAEwJNs/QgKgGjIABmH7x0kAVEYGQFu2f7R8jhWrY2trdxJlHCLnBpAAVwFSpG/jJwAqVtPjiVkiLTV1rMf/agmA6skACmf7p0IA1EIGUCzbPyECoC4ygALZ/mnxsdarvn1tJIiKVk+RG0C96utdVwHiYfsnSgDUTgaQN9s/XT7fhtS6rM0JQejq1LkBNKTWbnYVoHm2fwYEQHNkANmw/fPgg25a3Zva8FArDZwTN4Cm1d3frgLUx/bPjI87GJdo0qJj8+NDD8nzFEnQqLnyCigkr4OIn+2fMR99eA2saTPGKOjM7Pn0o9DMo7phY5g0ZCG8AopCM5PgjRDDYfuXwxnExewRkPYrjZOITmPP6eaQfrquTF4BRaexCfFGiNNs/2I5j0g1uZ2NZbG0WeEcSdTMJzXRWrQEQPwaflFjVrOno+jnbBLQ/Mt6Q5sljcQAjicZppdR0zy05ZBSEuTndkxy0vQMg3BOiQn1s5tGOjlahSE5qiQF/BF+4x05vcHwObBUhf1jXEY9QlqCkXJmaTPztLQBo+XkkhfDb3SwAoJw9HTI4WUihl3Qsg4a4aypiiPMRyR7oWU11MYRUy2nmJt4dkTLmqiIM6UmzjJPUa2M0yyOEXGCNMCJZivCDXKaPTIIp0aTHGrmol0op1krLWdEOI62CJGvmNOKWjROhBg44IIksXT6ZbZ9fPhEyDEXJ61N1C+5leRzJn4Ou0SJ7qYzRbKtfJ4kynmXK5u11Vblu8zHRX6cOpmvNgZh7xfO8fMmMVAUq5+WAGAAMZA9q59+WoE2xECWrH4G0BCclRjIhtVPW9qCoUmCRNn7DE5/MFxiICFWP8OhSxgxSRAte58R0S6MniSIhL3P6OgbOiUGArL66YTuoTKSoDH2PpXQRtRCGFTO0qdyWop6SYIO2fvUR2/RHGEwTJY+zdBnhCEMBrD0aZ6eI7xiw8DSJyz9R3QyzgMbn6hoR2KXdB7Y+MRMd5KkCFPBric5WpY8VZ4Q9jsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANC5/wPQ4044MoRAxAAAAABJRU5ErkJggg==';


const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pdfmania-dev-secret-cambia-esto';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'pdfmania-demo';

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Envuelve handlers async y captura errores
const h = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Error interno' }); });

function signToken(user, workspaceId) {
  return jwt.sign({ uid: user.id, email: user.email, ws: workspaceId }, JWT_SECRET, { expiresIn: '30d' });
}
const firstWorkspace = (userId) => one('SELECT * FROM workspaces WHERE user_id=$1 ORDER BY id LIMIT 1', [userId]);

// Asegura que la cuenta tenga las 6 marcas (subcuentas) de PDFmania por país.
async function ensureCountries(userId) {
  const ws = await many('SELECT id,name FROM workspaces WHERE user_id=$1 ORDER BY id', [userId]);
  const onlyPlaceholder = ws.length === 1 && /Marca 1$/.test(ws[0].name || '');
  if (ws.length !== 0 && !onlyPlaceholder) return; // ya tiene sus marcas
  for (const c of COUNTRIES) {
    const w = await one('INSERT INTO workspaces (user_id,name,country_code,currency,timezone,flag,beneficiary_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [userId, c.name, c.cc, c.cur, c.tz, c.flag, 'PDFmania ' + c.cc]);
    for (const [n, p] of (CATALOG[c.cc] || [])) await q('INSERT INTO products (workspace_id,name,price) VALUES ($1,$2,$3)', [w.id, n, p]);
  }
  if (onlyPlaceholder) {
    const sc = await one('SELECT COUNT(*)::int c FROM sales WHERE workspace_id=$1', [ws[0].id]);
    if (sc.c === 0) await q('DELETE FROM workspaces WHERE id=$1', [ws[0].id]);
  }
}

async function authMiddleware(req, res, next) {
  const hh = req.headers.authorization || '';
  const token = hh.startsWith('Bearer ') ? hh.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await one('SELECT id,email,name,owner_id FROM users WHERE id=$1', [payload.uid]);
    if (!user) return res.status(401).json({ error: 'Usuario no existe' });
    // Cuenta = dueño. Los miembros del equipo comparten las marcas/datos del dueño.
    const accountId = user.owner_id || user.id;
    req.accountId = accountId;
    req.isOwner = !user.owner_id;
    let ws = await one('SELECT * FROM workspaces WHERE id=$1 AND user_id=$2', [payload.ws, accountId]);
    if (!ws) ws = await firstWorkspace(accountId);
    req.user = user; req.workspace = ws;
    next();
  } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
}
const auth = (fn) => [authMiddleware, h(fn)];

// ---------- Auth ----------
app.get('/api/auth/config', (req, res) => {
  res.json({ googleEnabled: !!GOOGLE_CLIENT_ID, googleClientId: GOOGLE_CLIENT_ID, devLogin: true });
});

app.post('/api/auth/signup', h(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Email y contraseña (mín. 6) requeridos' });
  const exists = await one('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'Ese correo ya está registrado' });
  const hash = bcrypt.hashSync(password, 10);
  const u = await one('INSERT INTO users (email,password_hash,name) VALUES ($1,$2,$3) RETURNING id', [email.toLowerCase(), hash, name || 'Nuevo usuario']);
  await ensureCountries(u.id); // crea las 6 marcas (subcuentas) por país
  const first = await firstWorkspace(u.id);
  const user = { id: u.id, email: email.toLowerCase(), name };
  res.json({ token: signToken(user, first ? first.id : null), user });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await one('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  if (!user || !user.password_hash || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  const ws = await firstWorkspace(user.owner_id || user.id);
  res.json({ token: signToken(user, ws ? ws.id : null), user: { id: user.id, email: user.email, name: user.name } });
}));

app.post('/api/auth/dev-login', h(async (req, res) => {
  const user = await one('SELECT * FROM users WHERE email=$1', ['demo@pdfmania.co']);
  if (!user) return res.status(404).json({ error: 'No hay usuario demo' });
  const ws = await firstWorkspace(user.id);
  res.json({ token: signToken(user, ws ? ws.id : null), user: { id: user.id, email: user.email, name: user.name } });
}));

app.get('/api/auth/account', auth(async (req, res) => {
  await ensureCountries(req.accountId); // si la cuenta está vacía, crea las 6 marcas
  try { if (!(await getSetting('public_url'))) await setSetting('public_url', req.protocol + '://' + req.get('host')); } catch (e) {}
  const ws = await one('SELECT * FROM workspaces WHERE id=$1 AND user_id=$2', [req.workspace ? req.workspace.id : 0, req.accountId]) || await firstWorkspace(req.accountId);
  res.json({ user: req.user, workspace: ws });
}));

// ---------- Workspaces ----------
app.get('/api/workspaces', auth(async (req, res) => {
  const list = await many('SELECT * FROM workspaces WHERE user_id=$1 ORDER BY id', [req.accountId]);
  res.json({ workspaces: list, current: req.workspace.id });
}));

app.post('/api/workspaces', auth(async (req, res) => {
  const { name, country_code, currency, timezone, flag } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const w = await one('INSERT INTO workspaces (user_id,name,country_code,currency,timezone,flag) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.accountId, name, country_code || 'CO', currency || 'COP', timezone || 'America/Bogota', flag || '🏳️']);
  res.json({ id: w.id });
}));

// Editar una marca (para corregir país/moneda/zona/bandera de una que se creó mal)
app.post('/api/workspaces/:id/edit', auth(async (req, res) => {
  const { name, country_code, currency, timezone, flag } = req.body || {};
  const ws = await one('SELECT id FROM workspaces WHERE id=$1 AND user_id=$2', [req.params.id, req.accountId]);
  if (!ws) return res.status(404).json({ error: 'Marca no encontrada' });
  await q('UPDATE workspaces SET name=COALESCE($1,name), country_code=COALESCE($2,country_code), currency=COALESCE($3,currency), timezone=COALESCE($4,timezone), flag=COALESCE($5,flag) WHERE id=$6',
    [name || null, country_code || null, currency || null, timezone || null, flag || null, ws.id]);
  res.json({ ok: true });
}));

app.post('/api/auth/switch-workspace', auth(async (req, res) => {
  const { workspaceId } = req.body || {};
  const ws = await one('SELECT * FROM workspaces WHERE id=$1 AND user_id=$2', [workspaceId, req.accountId]);
  if (!ws) return res.status(404).json({ error: 'Marca no encontrada' });
  res.json({ token: signToken(req.user, ws.id), workspace: ws });
}));

// ---------- Equipo (varios usuarios, misma cuenta, todos ven todo) ----------
app.get('/api/team', auth(async (req, res) => {
  const acc = req.accountId;
  const members = await many(
    "SELECT id,email,name,created_at FROM users WHERE id=$1 OR owner_id=$1 ORDER BY (id=$1) DESC, id ASC", [acc]);
  res.json({
    members: members.map(m => ({ id: m.id, email: m.email, name: m.name, created_at: m.created_at,
      role: m.id === acc ? 'Dueño' : 'Miembro', isMe: m.id === req.user.id })),
    isOwner: req.isOwner,
  });
}));

app.post('/api/team/invite', auth(async (req, res) => {
  if (!req.isOwner) return res.status(403).json({ error: 'Solo el dueño de la cuenta puede agregar miembros.' });
  const { name, email, password } = req.body || {};
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Nombre, correo y contraseña (mín. 6) requeridos' });
  const em = String(email).toLowerCase().trim();
  const exists = await one('SELECT id FROM users WHERE email=$1', [em]);
  if (exists) return res.status(409).json({ error: 'Ese correo ya está registrado' });
  const hash = bcrypt.hashSync(password, 10);
  const u = await one('INSERT INTO users (email,password_hash,name,owner_id) VALUES ($1,$2,$3,$4) RETURNING id,email,name',
    [em, hash, name || 'Miembro del equipo', req.accountId]);
  res.json({ ok: true, member: { id: u.id, email: u.email, name: u.name, role: 'Miembro' } });
}));

app.post('/api/team/:id/remove', auth(async (req, res) => {
  if (!req.isOwner) return res.status(403).json({ error: 'Solo el dueño puede quitar miembros.' });
  const id = parseInt(req.params.id, 10);
  if (id === req.accountId) return res.status(400).json({ error: 'No puedes quitar al dueño de la cuenta.' });
  const target = await one('SELECT id FROM users WHERE id=$1 AND owner_id=$2', [id, req.accountId]);
  if (!target) return res.status(404).json({ error: 'Miembro no encontrado en tu equipo.' });
  await q('DELETE FROM users WHERE id=$1', [id]);
  res.json({ ok: true });
}));

// ---------- Dashboard ----------
app.get('/api/dashboard/products', auth(async (req, res) => {
  const list = await many('SELECT * FROM products WHERE workspace_id=$1 ORDER BY price DESC', [req.workspace.id]);
  res.json({ products: list });
}));

app.get('/api/dashboard/sales', auth(async (req, res) => {
  const wsId = req.workspace.id;
  const range = req.query.range || '30';
  // TODO en la ZONA HORARIA del país (no UTC). Así "hoy", "período", chart, etc. cuadran entre sí.
  const wtzRaw = req.workspace.timezone || 'UTC';
  const wtz = /^[A-Za-z_\/+-]+$/.test(wtzRaw) ? wtzRaw : 'UTC';
  const dCol = `(created_at AT TIME ZONE '${wtz}')::date`;
  const todayE = `(now() AT TIME ZONE '${wtz}')::date`;
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: wtz }).format(new Date());
  const addDays = (str, n) => { const d = new Date(str + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  // Construir el filtro de fechas segun el rango elegido (tz del país)
  let cond = '', p = [wsId];
  let startStr = todayStr, endStr = todayStr;
  if (range === 'today') { cond = ` AND ${dCol} = ${todayE}`; }
  else if (range === '7') { cond = ` AND ${dCol} >= ${todayE}-6`; startStr = addDays(todayStr, -6); }
  else if (range === 'all') {
    cond = '';
    const mn = await one(`SELECT to_char(MIN(${dCol}),'YYYY-MM-DD') d FROM sales WHERE workspace_id=$1`, [wsId]);
    startStr = (mn && mn.d) || addDays(todayStr, -29);
  }
  else if (range === 'custom' && req.query.from && req.query.to) {
    cond = ` AND ${dCol} BETWEEN $2 AND $3`; p.push(req.query.from, req.query.to);
    startStr = req.query.from; endStr = req.query.to;
  }
  else { cond = ` AND ${dCol} >= ${todayE}-29`; startStr = addDays(todayStr, -29); }

  const periodo = await one(`SELECT COALESCE(SUM(amount),0)::float8 s, COUNT(*)::int c FROM sales WHERE workspace_id=$1${cond}`, p);
  const hoy = await one(`SELECT COALESCE(SUM(amount),0)::float8 s, COUNT(*)::int c FROM sales WHERE workspace_id=$1 AND ${dCol} = ${todayE}`, [wsId]);
  // Contactos reales = conversaciones (leads) que entraron en el rango elegido
  const contactos = (await one(`SELECT COUNT(*)::int c FROM conversations WHERE workspace_id=$1${cond}`, p)).c;
  const conversion = contactos > 0 ? (periodo.c / contactos * 100) : 0;

  // Pipeline: cuántos clientes hay en cada etapa (dentro del rango)
  const pipeRows = await many(`SELECT COALESCE(stage,'nuevo') stage, COUNT(*)::int c FROM conversations WHERE workspace_id=$1${cond} GROUP BY 1`, p);
  const pipeMap = Object.fromEntries(pipeRows.map(r => [r.stage, r.c]));
  const pipeline = {
    nuevo: pipeMap.nuevo || 0,
    conversando: pipeMap.conversando || 0,
    pago: pipeMap.pago || 0,
    cliente: pipeMap.cliente || 0,
  };

  // Rendimiento por producto (dentro del rango)
  const porProducto = await many(`SELECT product_name, COUNT(*)::int unidades, COALESCE(SUM(amount),0)::float8 ingresos
     FROM sales WHERE workspace_id=$1${cond} GROUP BY product_name ORDER BY ingresos DESC`, p);
  const topProduct = porProducto[0] ? { product_name: porProducto[0].product_name, ventas: porProducto[0].unidades, ingresos: porProducto[0].ingresos } : null;

  // Serie diaria dentro del rango (agrupada en la tz del país)
  const rows = await many(`SELECT to_char(${dCol},'YYYY-MM-DD') d, COALESCE(SUM(amount),0)::float8 ingresos, COUNT(*)::int ventas
     FROM sales WHERE workspace_id=$1${cond} GROUP BY 1`, p);
  const map = Object.fromEntries(rows.map(r => [r.d, r]));
  let days = Math.round((new Date(endStr + 'T00:00:00Z') - new Date(startStr + 'T00:00:00Z')) / 864e5) + 1;
  if (days < 1) days = 1; if (days > 120) { startStr = addDays(endStr, -119); days = 120; }
  const labels = [], serieIngresos = [], serieVentas = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(startStr, i);
    labels.push(key.slice(5));
    serieIngresos.push(map[key] ? map[key].ingresos : 0);
    serieVentas.push(map[key] ? map[key].ventas : 0);
  }

  // Mejor producto por día (dentro del rango, tz del país)
  const mejorDia = await many(`SELECT d, product_name, ingresos FROM (
      SELECT to_char(${dCol},'YYYY-MM-DD') d, product_name, COALESCE(SUM(amount),0)::float8 ingresos,
             ROW_NUMBER() OVER (PARTITION BY to_char(${dCol},'YYYY-MM-DD') ORDER BY SUM(amount) DESC) rn
      FROM sales WHERE workspace_id=$1${cond} GROUP BY 1, product_name
    ) t WHERE rn=1 ORDER BY d DESC LIMIT 14`, p);

  const topClientes = await many(`SELECT customer_name, COUNT(*)::int ventas, COALESCE(SUM(amount),0)::float8 total
     FROM sales WHERE workspace_id=$1${cond} GROUP BY customer_name ORDER BY total DESC LIMIT 5`, p);

  // Gasto de anuncios (Meta) de ESTE país en el rango seleccionado, en la moneda local
  // IMPORTANTE: "hoy" del gasto se calcula en la ZONA HORARIA de la cuenta de anuncios (meta_tz),
  // porque Meta guarda la fecha del gasto en esa zona (no en UTC). Si no, "hoy" no cuadra.
  const adTzRaw = (await getSetting('meta_tz')) || 'UTC';
  const adTz = /^[A-Za-z_\/+-]+$/.test(adTzRaw) ? adTzRaw : 'UTC';
  const adToday = `(now() AT TIME ZONE '${adTz}')::date`;
  const cc = req.workspace.country_code;
  let sc = '', sp = [cc];
  if (range === 'today') sc = ` AND date = ${adToday}`;
  else if (range === '7') sc = ` AND date >= ${adToday}-6`;
  else if (range === 'all') sc = '';
  else if (range === 'custom' && req.query.from && req.query.to) { sc = ' AND date BETWEEN $2 AND $3'; sp.push(req.query.from, req.query.to); }
  else sc = ` AND date >= ${adToday}-29`;
  const spendRow = await one(`SELECT COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code=$1${sc}`, sp);
  const fxRow = await one('SELECT fx FROM countries WHERE code=$1', [cc]);
  const fx = (fxRow && fxRow.fx) || 1;
  const gastoUsd = spendRow.s;
  const gastoLocal = gastoUsd * fx;
  const roas = gastoLocal > 0 ? periodo.s / gastoLocal : null;
  const neto = periodo.s - gastoLocal;

  // Meta del mes (ingresos del mes calendario en tz del país vs objetivo)
  const mesRow = await one(`SELECT COALESCE(SUM(amount),0)::float8 s FROM sales WHERE workspace_id=$1 AND date_trunc('month',(created_at AT TIME ZONE '${wtz}'))=date_trunc('month',(now() AT TIME ZONE '${wtz}'))`, [wsId]);
  const goal = Number(req.workspace.goal_amount || 0);
  const mesRevenue = mesRow.s;

  // Si la marca está en "mostrar en USD" (para monedas volátiles como VES), convertimos todo a dólares.
  const disp = !!req.workspace.display_usd;
  const D = v => (disp && fx > 0) ? (Number(v || 0) / fx) : Number(v || 0);
  const dispCur = disp ? 'USD' : req.workspace.currency;

  res.json({
    currency: dispCur, range, displayUsd: disp, fxRate: fx,
    ingresosHoy: D(hoy.s), ventasHoy: hoy.c,
    ingresosPeriodo: D(periodo.s), ventasPeriodo: periodo.c,
    contactos, conversion: Math.round(conversion * 10) / 10,
    goal: D(goal), mesRevenue: D(mesRevenue),
    pipeline,
    topProduct: topProduct ? { ...topProduct, ingresos: D(topProduct.ingresos) } : null,
    porProducto: porProducto.map(p => ({ ...p, ingresos: D(p.ingresos) })),
    mejorDia: mejorDia.map(m => ({ ...m, ingresos: D(m.ingresos) })),
    ticketPromedio: D(periodo.c > 0 ? periodo.s / periodo.c : 0),
    gastoLocal: disp ? gastoUsd : gastoLocal, gastoUsd, roas, neto: D(neto),
    chart: { labels, ingresos: serieIngresos.map(D), ventas: serieVentas },
    topClientes: topClientes.map(c => ({ ...c, total: D(c.total) })),
    ventasPorProducto: porProducto.map(p => ({ product_name: p.product_name, ventas: p.unidades, total: D(p.ingresos) })),
  });
}));

// Pipeline tipo CRM: columnas por etapa con clientes y valor total por etapa
app.get('/api/pipeline', auth(async (req, res) => {
  const wsId = req.workspace.id;
  // Valor de referencia por lead que aún no compra: precio del producto (el más caro si hay varios)
  const prodRow = await one('SELECT COALESCE(MAX(price),0)::float8 p FROM products WHERE workspace_id=$1', [wsId]);
  const refPrice = prodRow ? prodRow.p : 0;
  // Conversaciones con su venta real (si existe) y último monto de comprobante
  const rows = await many(`
    SELECT c.id, c.wa_id, c.name, COALESCE(c.stage,'nuevo') stage, c.last_at, c.last_message,
           s.amount AS sale_amount,
           r.amount AS receipt_amount
    FROM conversations c
    LEFT JOIN LATERAL (SELECT amount FROM sales WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) s ON true
    LEFT JOIN LATERAL (SELECT amount FROM receipts WHERE conversation_id=c.id AND amount IS NOT NULL ORDER BY created_at DESC LIMIT 1) r ON true
    WHERE c.workspace_id=$1
    ORDER BY c.last_at DESC NULLS LAST`, [wsId]);
  const STAGES = ['nuevo', 'conversando', 'pago', 'cliente'];
  const cols = {}; STAGES.forEach(s => cols[s] = { stage: s, count: 0, value: 0, clients: [] });
  for (const r of rows) {
    const st = STAGES.includes(r.stage) ? r.stage : 'nuevo';
    // Valor: venta real > monto de comprobante > precio de referencia del producto
    const val = r.sale_amount != null ? Number(r.sale_amount)
      : (r.receipt_amount != null ? Number(r.receipt_amount) : refPrice);
    cols[st].count++;
    cols[st].value += val;
    cols[st].clients.push({ id: r.id, wa_id: r.wa_id, name: r.name || r.wa_id, last_at: r.last_at, last_message: r.last_message, value: val, isSale: r.sale_amount != null });
  }
  const totalLeads = rows.length;
  const totalValue = STAGES.reduce((a, s) => a + cols[s].value, 0);
  res.json({
    currency: req.workspace.currency,
    stages: STAGES.map(s => cols[s]),
    totalLeads, totalValue, refPrice,
  });
}));

app.get('/api/dashboard/sales-list', auth(async (req, res) => {
  const list = await many('SELECT * FROM sales WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100', [req.workspace.id]);
  res.json({ sales: list });
}));

// Última venta de toda la cuenta (para el sonido de caja en tiempo real)
app.get('/api/sales/latest', auth(async (req, res) => {
  const r = await one(`SELECT s.id, s.product_name, s.amount, w.flag, w.name, w.currency
    FROM sales s JOIN workspaces w ON w.id=s.workspace_id WHERE w.user_id=$1 ORDER BY s.id DESC LIMIT 1`, [req.accountId]);
  res.json({ lastId: r ? r.id : 0, sale: r || null });
}));

app.post('/api/dashboard/sale', auth(async (req, res) => {
  const { product_name, amount, customer_name, source } = req.body || {};
  if (!amount) return res.status(400).json({ error: 'Monto requerido' });
  const prod = await one('SELECT id FROM products WHERE workspace_id=$1 AND name=$2', [req.workspace.id, product_name || '']);
  const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.workspace.id, prod ? prod.id : null, product_name || 'Venta', Math.round(amount), customer_name || 'Cliente', source || 'manual']);
  res.json({ id: s.id });
}));

// ---------- Parte 4: Modelo financiero (Waterfall NETO Jonás) ----------
// Traduce el rango de fechas (?range=today|7|30|custom|all) a condiciones SQL seguras.
// tz = zona horaria de la cuenta de anuncios, para que "hoy" cuadre con Meta.
function safeDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null; }
function financeRangeConds(qy, tz) {
  const t = (tz && /^[A-Za-z_\/+-]+$/.test(tz)) ? tz : 'UTC';
  const today = `(now() AT TIME ZONE '${t}')::date`;
  const sd = `(created_at AT TIME ZONE '${t}')::date`;
  const range = (qy && qy.range) || 'all';
  if (range === 'today') return { salesCond: `AND ${sd} = ${today}`, spendCond: `AND date = ${today}` };
  if (range === '7') return { salesCond: `AND ${sd} >= ${today}-6`, spendCond: `AND date >= ${today}-6` };
  if (range === '30') return { salesCond: `AND ${sd} >= ${today}-29`, spendCond: `AND date >= ${today}-29` };
  if (range === 'custom') { const f = safeDate(qy.from), tt = safeDate(qy.to); if (f && tt) return { salesCond: `AND ${sd} BETWEEN '${f}' AND '${tt}'`, spendCond: `AND date BETWEEN '${f}' AND '${tt}'` }; }
  return { salesCond: '', spendCond: '' };
}
async function computeFinanceForUser(userId, conds, workspaceId) {
  const salesCond = (conds && conds.salesCond) || '';
  const spendCond = (conds && conds.spendCond) || '';
  const workspaces = workspaceId
    ? await many('SELECT * FROM workspaces WHERE user_id=$1 AND id=$2 ORDER BY id', [userId, workspaceId])
    : await many('SELECT * FROM workspaces WHERE user_id=$1 ORDER BY id', [userId]);
  const rows = [];
  for (const w of workspaces) {
    const c = (await one('SELECT * FROM countries WHERE code=$1', [w.country_code])) || { cobrador: 0, procesador: 0, andres: 15, proc_name: '—', fx: 1 };
    const fx = c.fx || 1;
    const revRow = await one(`SELECT COALESCE(SUM(amount),0)::float8 s FROM sales WHERE workspace_id=$1 ${salesCond}`, [w.id]);
    const revenue = revRow.s / fx;
    const spendRow = await one(`SELECT COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code=$1 ${spendCond}`, [w.country_code]);
    const spend = spendRow.s;
    const cobrador = revenue * c.cobrador / 100;
    const procesador = revenue * c.procesador / 100;
    const gb = revenue - spend - cobrador - procesador;
    const andres = Math.max(0, gb) * c.andres / 100;
    const neto = revenue - spend - cobrador - procesador - andres;
    const roas = spend > 0 ? revenue / spend : null;
    let estado = 'Sin data';
    if (!(revenue === 0 && spend === 0)) {
      if (roas != null && roas > 2 && neto > 0) estado = 'Escalar';
      else if (roas != null && roas >= 1.5 && roas <= 2) estado = 'Mantener';
      else estado = 'Pausar';
    }
    rows.push({
      workspace_id: w.id, name: w.name, flag: w.flag, country_code: w.country_code,
      commissions: { cobrador: c.cobrador, procesador: c.procesador, andres: c.andres, proc_name: c.proc_name },
      revenue, spend, cobrador, procesador, gb, andres, neto, roas, estado,
    });
  }
  const T = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, spend: a.spend + r.spend, cobrador: a.cobrador + r.cobrador,
    procesador: a.procesador + r.procesador, andres: a.andres + r.andres, neto: a.neto + r.neto,
  }), { revenue: 0, spend: 0, cobrador: 0, procesador: 0, andres: 0, neto: 0 });
  T.roas = T.spend > 0 ? T.revenue / T.spend : null;
  T.pctNeto = T.revenue > 0 ? Math.round(T.neto / T.revenue * 1000) / 10 : 0;
  T.gb = T.revenue - T.spend - T.cobrador - T.procesador;
  return { totals: T, rows };
}

app.get('/api/finance/waterfall', auth(async (req, res) => {
  const tz = (await getSetting('meta_tz')) || 'UTC';
  const conds = financeRangeConds(req.query, tz);
  // Por defecto: SOLO el país/marca seleccionada. Con ?global=1: consolidado (todos).
  const global = req.query.global === '1';
  const data = await computeFinanceForUser(req.accountId, conds, global ? null : req.workspace.id);
  data.scope = global ? 'global' : 'country';
  data.workspaceName = req.workspace.name;
  data.flag = req.workspace.flag;
  data.countryCode = req.workspace.country_code;
  res.json(data);
}));

// ANÁLISIS: ROAS por producto (revenue vs gasto de ads asignado), por rango y país.
app.get('/api/analytics', auth(async (req, res) => {
  const tz = (await getSetting('meta_tz')) || 'UTC';
  const conds = financeRangeConds(req.query, tz);
  const country = req.query.country; // 'all' o un country_code
  const wss = (!country || country === 'all')
    ? await many('SELECT * FROM workspaces WHERE user_id=$1 ORDER BY id', [req.accountId])
    : await many('SELECT * FROM workspaces WHERE user_id=$1 AND country_code=$2 ORDER BY id', [req.accountId, country]);
  const codes = [...new Set(wss.map(w => w.country_code))];
  const fxByCode = {};
  for (const cc of codes) { const c = await one('SELECT fx FROM countries WHERE code=$1', [cc]); fxByCode[cc] = (c && c.fx) || 1; }
  // Revenue por producto (convertido a USD)
  const prodMap = {};
  for (const w of wss) {
    const fx = fxByCode[w.country_code] || 1;
    const rows = await many(`SELECT product_name, COUNT(*)::int u, COALESCE(SUM(amount),0)::float8 s FROM sales WHERE workspace_id=$1 ${conds.salesCond} GROUP BY product_name`, [w.id]);
    rows.forEach(r => { const k = r.product_name || '(sin nombre)'; prodMap[k] = prodMap[k] || { revenue: 0, units: 0, spend: 0 }; prodMap[k].revenue += r.s / fx; prodMap[k].units += r.u; });
  }
  // Gasto por producto (USD)
  let spendSinProducto = 0;
  if (codes.length) {
    const spendRows = await many(`SELECT product, COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code = ANY($1::text[]) ${conds.spendCond} GROUP BY product`, [codes]);
    spendRows.forEach(x => { if (!x.product) { spendSinProducto += x.s; return; } prodMap[x.product] = prodMap[x.product] || { revenue: 0, units: 0, spend: 0 }; prodMap[x.product].spend += x.s; });
  }
  const products = Object.entries(prodMap).map(([name, v]) => {
    const roas = v.spend > 0 ? v.revenue / v.spend : null;
    const neto = v.revenue - v.spend;
    let estado = 'Sin data';
    if (!(v.revenue === 0 && v.spend === 0)) { if (roas != null && roas > 2) estado = 'Escalar'; else if (roas != null && roas >= 1.5) estado = 'Mantener'; else estado = 'Pausar'; }
    return { product: name, revenue: v.revenue, spend: v.spend, units: v.units, ticket: v.units > 0 ? v.revenue / v.units : 0, roas, neto, estado };
  }).sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);
  const totals = products.reduce((a, p) => ({ revenue: a.revenue + p.revenue, spend: a.spend + p.spend, units: a.units + p.units }), { revenue: 0, spend: 0, units: 0 });
  totals.spend += spendSinProducto;
  totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : null;
  totals.neto = totals.revenue - totals.spend;
  const countriesList = await many('SELECT DISTINCT country_code, flag, name FROM workspaces WHERE user_id=$1 ORDER BY name', [req.accountId]);
  // Campañas cuyo gasto NO quedó asignado a un producto (para que el usuario las mapee con una regla).
  const unmatched = (!country || country === 'all')
    ? await many("SELECT campaign, country_code, COALESCE(SUM(spend_usd),0)::float8 spend FROM ad_spend WHERE product IS NULL AND campaign IS NOT NULL GROUP BY campaign, country_code ORDER BY spend DESC LIMIT 120")
    : await many("SELECT campaign, country_code, COALESCE(SUM(spend_usd),0)::float8 spend FROM ad_spend WHERE product IS NULL AND campaign IS NOT NULL AND country_code=$1 GROUP BY campaign, country_code ORDER BY spend DESC LIMIT 120", [country]);
  const allProducts = await allProductNames(req.accountId);
  const rules = await many('SELECT id, keyword, product_name FROM product_rules WHERE account_id=$1 ORDER BY id DESC', [req.accountId]);
  res.json({ products, totals, spendSinProducto, countries: countriesList, selectedCountry: country || 'all', unmatched, allProducts, rules });
}));

// ---------- Reglas de producto (campaña -> producto) ----------
app.get('/api/product-rules', auth(async (req, res) => {
  const rules = await many('SELECT id, keyword, product_name FROM product_rules WHERE account_id=$1 ORDER BY id DESC', [req.accountId]);
  res.json({ rules });
}));
app.post('/api/product-rules', auth(async (req, res) => {
  const kw = String((req.body && req.body.keyword) || '').trim();
  const pn = String((req.body && req.body.product_name) || '').trim();
  if (!kw || !pn) return res.status(400).json({ error: 'Falta la palabra clave o el producto' });
  const row = await one('INSERT INTO product_rules (account_id,keyword,product_name) VALUES ($1,$2,$3) RETURNING id,keyword,product_name', [req.accountId, kw, pn]);
  const changed = await reassignAdSpend(req.accountId); // aplica de inmediato a todo el gasto
  res.json({ rule: row, reassigned: changed });
}));
app.post('/api/product-rules/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM product_rules WHERE id=$1 AND account_id=$2', [req.params.id, req.accountId]);
  const changed = await reassignAdSpend(req.accountId);
  res.json({ ok: true, reassigned: changed });
}));
// Re-aplicar reglas + matcher a todo el gasto ya sincronizado (sin llamar a Meta).
app.post('/api/product-rules/reassign', auth(async (req, res) => {
  const changed = await reassignAdSpend(req.accountId);
  res.json({ ok: true, reassigned: changed });
}));

// ---------- Campañas: asignación EXPLÍCITA de producto y país por campaña ----------
app.get('/api/campaigns', auth(async (req, res) => {
  const rows = await many(
    `SELECT a.campaign,
            MAX(a.country_code) country_code,
            MAX(a.product) product,
            COALESCE(SUM(a.spend_usd),0)::float8 spend,
            m.product_name AS asn_product,
            m.country_code AS asn_country
     FROM ad_spend a
     LEFT JOIN campaign_map m ON m.account_id=$1 AND m.campaign=a.campaign
     WHERE a.campaign IS NOT NULL
     GROUP BY a.campaign, m.product_name, m.country_code
     ORDER BY spend DESC LIMIT 300`, [req.accountId]);
  const allProducts = await allProductNames(req.accountId);
  res.json({ campaigns: rows, allProducts });
}));
app.post('/api/campaigns/assign', auth(async (req, res) => {
  const camp = String((req.body && req.body.campaign) || '').trim();
  if (!camp) return res.status(400).json({ error: 'Falta la campaña' });
  const pn = (req.body && req.body.product_name != null && String(req.body.product_name).trim()) || null;
  const cc = (req.body && req.body.country_code != null && String(req.body.country_code).trim().toUpperCase()) || null;
  await q(`INSERT INTO campaign_map (account_id,campaign,product_name,country_code) VALUES ($1,$2,$3,$4)
           ON CONFLICT (account_id,campaign) DO UPDATE SET product_name=EXCLUDED.product_name, country_code=EXCLUDED.country_code`,
    [req.accountId, camp, pn, cc]);
  const changed = await reassignAdSpend(req.accountId);
  res.json({ ok: true, reassigned: changed });
}));

// Vista Global (founder): consolida TODOS los países + desglose por país
app.get('/api/dashboard/global', auth(async (req, res) => {
  const tz = (await getSetting('meta_tz')) || 'UTC';
  const conds = financeRangeConds(req.query, tz);
  const fin = await computeFinanceForUser(req.accountId, conds);
  const byWs = {};
  fin.rows.forEach(r => { byWs[r.workspace_id] = r; });
  const wss = await many('SELECT id,name,flag,country_code,currency FROM workspaces WHERE user_id=$1 ORDER BY id', [req.accountId]);
  const perCountry = [];
  let totalSales = 0;
  for (const w of wss) {
    const sc = await one(`SELECT COUNT(*)::int c FROM sales WHERE workspace_id=$1 ${conds.salesCond}`, [w.id]);
    const fr = byWs[w.id] || { revenue: 0, spend: 0, cobrador: 0, procesador: 0, andres: 0, neto: 0, roas: null, estado: 'Sin data' };
    totalSales += sc.c;
    perCountry.push({ workspace_id: w.id, name: w.name, flag: w.flag, currency: w.currency, sales: sc.c, revenue: fr.revenue, spend: fr.spend, cobrador: fr.cobrador || 0, procesador: fr.procesador || 0, andres: fr.andres || 0, proc_name: (fr.commissions && fr.commissions.proc_name) || 'Procesador', neto: fr.neto, roas: fr.roas, estado: fr.estado });
  }
  // Gasto de países que NO tienen marca todavía (Brasil, Venezuela, etc.) o sin país reconocido:
  // se INCLUYE en el total (para cuadrar con Meta) y se muestra como fila aparte.
  const wsCodes = new Set(wss.map(w => w.country_code));
  const spendRows = await many(`SELECT country_code, COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE 1=1 ${conds.spendCond} GROUP BY country_code`);
  const T = { ...fin.totals };
  let extraSpend = 0, unmatchedSpend = 0;
  for (const sr of spendRows) {
    if (wsCodes.has(sr.country_code)) continue; // ya está contado en las marcas
    const spend = Math.round((sr.s || 0) * 100) / 100;
    if (spend <= 0) continue;
    extraSpend += spend;
    const isXX = sr.country_code === 'XX';
    if (isXX) unmatchedSpend += spend;
    perCountry.push({
      workspace_id: null,
      name: isXX ? 'Sin país (revisar nombre)' : (COUNTRY_NAMES[sr.country_code] || sr.country_code),
      flag: isXX ? '🌐' : (COUNTRY_FLAGS[sr.country_code] || '🏳️'),
      currency: 'USD', sales: 0, revenue: 0, spend, cobrador: 0, procesador: 0, andres: 0, proc_name: 'Procesador', neto: -spend, roas: null, estado: 'Sin data',
      no_brand: true,
    });
  }
  if (extraSpend > 0) {
    T.spend = (T.spend || 0) + extraSpend;
    T.neto = (T.neto || 0) - extraSpend;
    T.gb = (T.gb || 0) - extraSpend;
    T.roas = T.spend > 0 ? T.revenue / T.spend : null;
    T.pctNeto = T.revenue > 0 ? Math.round(T.neto / T.revenue * 1000) / 10 : 0;
  }
  res.json({ totals: T, totalSales, perCountry, unmatchedSpend });
}));

app.get('/api/ads/spend', auth(async (req, res) => {
  const fin = await computeFinanceForUser(req.accountId);
  const byCountry = fin.rows.filter(r => r.spend > 0 || r.revenue > 0);
  const campaigns = [];
  for (const r of byCountry) {
    const camps = await many('SELECT campaign, product, spend_usd FROM ad_spend WHERE country_code=$1', [r.country_code]);
    camps.forEach(c => campaigns.push({ name: c.campaign, product: c.product || '—', pais: r.flag + ' ' + r.country_code, spend: c.spend_usd, roas: r.roas, estado: r.estado }));
  }
  // Campañas cuyo nombre no tenía país reconocido: se guardan como 'XX' para no perder el gasto
  const noCountry = await many("SELECT campaign, product, spend_usd FROM ad_spend WHERE country_code='XX'");
  noCountry.forEach(c => campaigns.push({ name: c.campaign, product: c.product || '—', pais: '🌐 Sin país', spend: c.spend_usd, roas: null, estado: 'Sin data' }));
  const byProduct = await productAdsBreakdown(req.accountId);
  const connected = ((await one("SELECT value FROM settings WHERE key='meta_connected'")) || {}).value === '1';
  const acct = ((await one("SELECT value FROM settings WHERE key='meta_account'")) || {}).value || '';
  const lastSync = (await getSetting('meta_last_sync')) || null;
  const realTotal = (await one('SELECT COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend')).s;
  const unmatchedTotal = noCountry.reduce((a, c) => a + (c.spend_usd || 0), 0);
  res.json({ connected, account: acct, lastSync, campaigns, byCountry, byProduct, realTotal, unmatchedTotal, autoSync: true });
}));

app.post('/api/ads/connect', auth(async (req, res) => {
  const { account, token } = req.body || {};
  await setSetting('meta_connected', '1');
  await setSetting('meta_account', account || '');
  await setSetting('meta_user', String(req.accountId));
  if (token) await setSetting('meta_token', token);
  res.json({ connected: true });
}));
app.post('/api/ads/disconnect', auth(async (req, res) => {
  await setSetting('meta_connected', '0');
  res.json({ connected: false });
}));

// --- Sincronización real con Meta Marketing API ---
// Convierte la moneda de la cuenta de anuncios a USD usando la tabla fx (unidades locales por USD)
async function currencyToUsdFactor(currencyCode) {
  if (!currencyCode || currencyCode === 'USD') return 1;
  const entry = COUNTRIES.find(c => c.cur === currencyCode);
  if (!entry) return 1;
  const row = await one('SELECT fx FROM countries WHERE code=$1', [entry.cc]);
  return (row && row.fx) ? row.fx : 1;
}
// Mapas de países LATAM (código -> nombre / bandera) para mostrar y detectar
const COUNTRY_NAMES = { CO: 'Colombia', AR: 'Argentina', MX: 'México', CR: 'Costa Rica', GT: 'Guatemala', DO: 'RD', VE: 'Venezuela', BR: 'Brasil', PE: 'Perú', EC: 'Ecuador', CL: 'Chile', BO: 'Bolivia', PY: 'Paraguay', UY: 'Uruguay', PA: 'Panamá', HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua', US: 'USA', ES: 'España' };
const COUNTRY_FLAGS = { CO: '🇨🇴', AR: '🇦🇷', MX: '🇲🇽', CR: '🇨🇷', GT: '🇬🇹', DO: '🇩🇴', VE: '🇻🇪', BR: '🇧🇷', PE: '🇵🇪', EC: '🇪🇨', CL: '🇨🇱', BO: '🇧🇴', PY: '🇵🇾', UY: '🇺🇾', PA: '🇵🇦', HN: '🇭🇳', SV: '🇸🇻', NI: '🇳🇮', US: '🇺🇸', ES: '🇪🇸' };
// Convierte una bandera emoji (dos indicadores regionales) a su código ISO (🇲🇽 -> "MX")
function flagToCode(str) {
  const RA = 0x1F1E6; // 🇦
  const cps = [...(str || '')].map(c => c.codePointAt(0));
  for (let i = 0; i < cps.length - 1; i++) {
    if (cps[i] >= RA && cps[i] <= RA + 25 && cps[i + 1] >= RA && cps[i + 1] <= RA + 25) {
      return String.fromCharCode(65 + cps[i] - RA) + String.fromCharCode(65 + cps[i + 1] - RA);
    }
  }
  return null;
}
// Detecta el país de una campaña por: 1) bandera emoji, 2) nombre, 3) abreviación
function parseCountryFromName(name) {
  const raw = name || '';
  const flag = flagToCode(raw);
  if (flag && COUNTRY_NAMES[flag]) return flag;
  const s = normText(raw); // minúsculas, sin acentos
  const map = [
    ['MX', /(mexico|\bmx\b|\bmex\b|\bmxn\b)/],
    ['CO', /(colombia|bogota|\bcol\b|\bco\b)/],
    ['AR', /(argentina|buenos aires|\barg\b|\bar\b)/],
    ['CR', /(costa rica|\bcr\b|\bcri\b)/],
    ['GT', /(guatemala|\bgt\b|\bgua\b|\bgtm\b)/],
    ['DO', /(republica dominicana|dominicana|santo domingo|\brd\b|\bdo\b|\bdom\b)/],
    ['VE', /(venezuela|\bve\b|\bven\b)/],
    ['BR', /(brasil|brazil|\bbr\b|\bbra\b)/],
    ['PE', /(\bperu\b|\bpe\b|\bper\b)/],
    ['EC', /(ecuador|\bec\b|\becu\b)/],
    ['CL', /(chile|\bcl\b|\bchl\b)/],
    ['BO', /(bolivia|\bbo\b|\bbol\b)/],
    ['PY', /(paraguay|\bpy\b|\bpry\b)/],
    ['UY', /(uruguay|\buy\b|\bury\b)/],
    ['PA', /(panama|\bpa\b|\bpan\b)/],
    ['HN', /(honduras|\bhn\b|\bhnd\b)/],
    ['SV', /(salvador|\bsv\b|\bslv\b)/],
    ['NI', /(nicaragua|\bni\b|\bnic\b)/],
  ];
  for (const [cc, re] of map) if (re.test(s)) return cc;
  return null;
}
// Palabras genéricas de nombres de campañas/productos que NO identifican al producto
const PROD_STOP = new Set(['pack', 'de', 'el', 'la', 'los', 'las', 'del', 'y', 'con', 'para',
  'curso', 'guia', 'ebook', 'plantillas', 'plantilla', 'pro', 'premium', 'completo', 'completa',
  'profesional', 'oferta', 'promo', 'promocion', 'test', 'cbo', 'cbo1', 'cbo2', 'cbo3', 'cbo4',
  'advantage', 'retargeting', 'campana', 'anuncio', 'nuevo', 'nueva', 'dia', 'hoy', 'bono', 'bonos', 'digital']);
// Empareja el producto por PALABRAS CLAVE dentro del nombre de la campaña (ej. "AUTOMOTRIZ", "MOTOS").
function matchProduct(name, products) {
  const s = normText(name);           // minúsculas, sin acentos
  let best = null, bestScore = 0;
  for (const p of products) {
    const pn = normText(p);
    if (!pn) continue;
    let score = 0;
    // 1) nombre completo del producto en la campaña -> match fuerte
    if (s.includes(pn)) score += pn.length * 3;
    // 2) palabras clave significativas del producto (>=4 letras, sin genéricas)
    const words = pn.split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !PROD_STOP.has(w));
    for (const w of words) {
      if (s.includes(w)) score += w.length;       // ej. "automotriz" (10), "motos" (5)
      else if (w.endsWith('s') && s.includes(w.slice(0, -1))) score += w.length - 1; // plural/singular
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? best : null;
}
async function allProductNames(userId) {
  const rows = await many('SELECT DISTINCT p.name FROM products p JOIN workspaces w ON w.id=p.workspace_id WHERE w.user_id=$1', [userId]);
  return rows.map(r => r.name).filter(Boolean);
}
// Asignación explícita por campaña (producto + país elegidos por el usuario). Clave = nombre exacto.
async function getCampaignMap(userId) {
  const rows = await many('SELECT campaign, product_name, country_code FROM campaign_map WHERE account_id=$1', [userId]);
  const m = {}; rows.forEach(r => { m[r.campaign] = r; }); return m;
}
// Reglas determinísticas: si el nombre de campaña contiene la keyword -> ese producto.
async function getProductRules(userId) {
  return await many('SELECT keyword, product_name FROM product_rules WHERE account_id=$1 ORDER BY length(keyword) DESC', [userId]);
}
function ruleMatchProduct(name, rules) {
  const s = normText(name);
  for (const r of (rules || [])) { const kw = normText(r.keyword); if (kw && s.includes(kw)) return r.product_name; }
  return null;
}
// Resuelve el producto de una campaña: 1) reglas del usuario, 2) coincidencia por palabras clave.
function resolveCampaignProduct(name, rules, products) {
  return ruleMatchProduct(name, rules) || matchProduct(name, products);
}
// Re-asigna producto y país de TODO el ad_spend: 1) asignación explícita por campaña, 2) reglas, 3) matcher.
async function reassignAdSpend(userId) {
  const cmap = await getCampaignMap(userId);
  const rules = await getProductRules(userId);
  const products = await allProductNames(userId);
  const rows = await many('SELECT id, campaign, country_code FROM ad_spend');
  let changed = 0;
  for (const r of rows) {
    const asn = cmap[r.campaign];
    let cc = r.country_code, prod;
    if (asn) {
      if (asn.country_code) cc = asn.country_code;
      prod = asn.product_name || resolveCampaignProduct(r.campaign || '', rules, products);
    } else {
      prod = resolveCampaignProduct(r.campaign || '', rules, products);
    }
    await q('UPDATE ad_spend SET product=$1, country_code=$2 WHERE id=$3', [prod, cc, r.id]);
    changed++;
  }
  return changed;
}

app.get('/api/ads/sync-status', auth(async (req, res) => {
  res.json({
    connected: (await getSetting('meta_connected')) === '1',
    account: (await getSetting('meta_account')) || '',
    has_token: !!(await getSetting('meta_token')),
    last_sync: (await getSetting('meta_last_sync')) || null,
  });
}));

// Función reutilizable: la usa el botón manual, el auto-sync y el temporizador de fondo.
let _syncLock = false;
async function runMetaSync(userId, preset) {
  if (_syncLock) return { error: 'busy' };
  _syncLock = true;
  try {
    return await runMetaSyncInner(userId, preset);
  } finally {
    _syncLock = false;
  }
}
async function runMetaSyncInner(userId, preset) {
  const act = ((await getSetting('meta_account')) || '').trim();
  const token = ((await getSetting('meta_token')) || '').trim();
  if (!act || !token) return { error: 'no_creds' };
  const acctId = act.startsWith('act_') ? act : ('act_' + act.replace(/[^0-9]/g, ''));
  preset = preset || 'last_30d';
  // 1) Moneda + zona horaria de la cuenta
  let currency = 'USD', acctName = '', tz = 'UTC';
  try {
    const info = await fetch(`https://graph.facebook.com/v21.0/${acctId}?fields=currency,name,timezone_name&access_token=${encodeURIComponent(token)}`).then(r => r.json());
    if (info.error) return { error: 'Meta: ' + info.error.message };
    currency = info.currency || 'USD'; acctName = info.name || ''; tz = info.timezone_name || 'UTC';
    await setSetting('meta_tz', tz);
  } catch (e) { return { error: 'No pude conectar con Meta. Revisa el token.' }; }
  const factor = await currencyToUsdFactor(currency);
  // 2) Rango de fechas en la zona horaria de la cuenta, INCLUYENDO hoy
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const sinceD = new Date(todayStr + 'T00:00:00Z'); sinceD.setUTCDate(sinceD.getUTCDate() - 29);
  const sinceStr = sinceD.toISOString().slice(0, 10);
  const tr = encodeURIComponent(JSON.stringify({ since: sinceStr, until: todayStr }));
  // 3) Insights por campaña, día por día (con paginación)
  let url = `https://graph.facebook.com/v21.0/${acctId}/insights?level=campaign&fields=campaign_name,spend,date_start&time_range=${tr}&time_increment=1&limit=500&access_token=${encodeURIComponent(token)}`;
  const rows = []; let guard = 0;
  while (url && guard < 25) {
    let d;
    try { d = await fetch(url).then(r => r.json()); } catch (e) { return { error: 'Error consultando Meta' }; }
    if (d.error) return { error: 'Meta: ' + d.error.message };
    (d.data || []).forEach(x => rows.push(x));
    url = (d.paging && d.paging.next) || null; guard++;
  }
  // 3) Repartir por país y producto. Meta es la fuente de verdad: borramos todo y reescribimos.
  const products = await allProductNames(userId);
  const rules = await getProductRules(userId);
  const cmap = await getCampaignMap(userId);
  await q('DELETE FROM ad_spend');
  let synced = 0, totalUsd = 0, unmatchedUsd = 0; const unmatched = [];
  for (const r of rows) {
    const spendUsd = (parseFloat(r.spend || '0') || 0) / factor;
    const asn = cmap[r.campaign_name];
    // País: 1) el que asignó el usuario, 2) el detectado por el nombre.
    let cc = (asn && asn.country_code) || parseCountryFromName(r.campaign_name);
    // Producto: 1) el que asignó el usuario, 2) reglas, 3) matcher.
    const prod = (asn && asn.product_name) || resolveCampaignProduct(r.campaign_name, rules, products);
    if (!cc) {
      // No perder el gasto: se guarda como 'XX' (Sin país) para que el total sí cuadre con Meta.
      if (spendUsd > 0) {
        unmatched.push({ name: r.campaign_name, spend: Math.round(spendUsd * 100) / 100 });
        unmatchedUsd += spendUsd;
        await q("INSERT INTO ad_spend (country_code,campaign,product,spend_usd,source,date) VALUES ('XX',$1,$2,$3,'meta',COALESCE($4,current_date))", [r.campaign_name, prod, spendUsd, r.date_start || null]);
      }
      continue;
    }
    await q("INSERT INTO ad_spend (country_code,campaign,product,spend_usd,source,date) VALUES ($1,$2,$3,$4,'meta',COALESCE($5,current_date))", [cc, r.campaign_name, prod, spendUsd, r.date_start || null]);
    synced++; totalUsd += spendUsd;
  }
  await setSetting('meta_last_sync', new Date().toISOString());
  return {
    synced, unmatched, currency, account_name: acctName,
    matched_usd: Math.round(totalUsd * 100) / 100,
    unmatched_usd: Math.round(unmatchedUsd * 100) / 100,
    total_usd: Math.round((totalUsd + unmatchedUsd) * 100) / 100,
    campaigns_found: rows.length,
  };
}

app.post('/api/ads/sync', auth(async (req, res) => {
  await setSetting('meta_user', String(req.accountId));
  const out = await runMetaSync(req.accountId, (req.body && req.body.range) || 'last_30d');
  if (out.error === 'no_creds') return res.status(400).json({ error: 'Falta el ID de cuenta (act_...) o el token. Conéctalos primero.' });
  if (out.error === 'busy') return res.status(409).json({ error: 'Ya hay una sincronización en curso. Espera unos segundos y vuelve a intentar.' });
  if (out.error) return res.status(400).json({ error: out.error });
  res.json(out);
}));

// Sincronización automática en segundo plano (cada 20 min mientras el servidor esté vivo)
let _autoSyncRunning = false;
async function autoMetaSync() {
  if (_autoSyncRunning) return;
  _autoSyncRunning = true;
  try {
    if ((await getSetting('meta_connected')) !== '1') return;
    if (!(await getSetting('meta_token'))) return;
    let uid = parseInt((await getSetting('meta_user')) || '0', 10);
    if (!uid) { const u = await one('SELECT id FROM users ORDER BY id LIMIT 1'); uid = u ? u.id : 0; }
    if (!uid) return;
    const out = await runMetaSync(uid, 'last_30d');
    if (out && !out.error) console.log('[auto-sync] Meta Ads OK · total $' + out.total_usd);
    else if (out && out.error && out.error !== 'no_creds') console.error('[auto-sync]', out.error);
  } catch (e) { console.error('[auto-sync]', e.message); }
  finally { _autoSyncRunning = false; }
}
setInterval(autoMetaSync, 20 * 60 * 1000);
setTimeout(autoMetaSync, 15 * 1000); // una corrida al arrancar

// Borra todos los gastos (para limpiar los datos de ejemplo)
app.post('/api/ads/clear', auth(async (req, res) => {
  await q('DELETE FROM ad_spend');
  res.json({ ok: true });
}));

// ---------- WhatsApp Cloud API: conexión ----------
async function getSetting(k) { const r = await one('SELECT value FROM settings WHERE key=$1', [k]); return r ? r.value : null; }
async function setSetting(k, v) { await q('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, v]); }

app.get('/api/cloud/config', auth(async (req, res) => {
  const ws = req.workspace;
  res.json({
    connected: !!ws.wa_connected,
    phone_number_id: ws.wa_phone_number_id || '',
    verify_token: (await getSetting('wa_verify_token')) || '', // el verify token es del webhook (compartido por la app)
    waba_id: ws.wa_waba_id || '',
    workspace_id: String(ws.id),
  });
}));

// Activa el número: suscribe la app a la WABA y registra el número en Cloud API.
app.post('/api/cloud/register', auth(async (req, res) => {
  const { waba_id, pin } = req.body || {};
  const phoneId = req.workspace.wa_phone_number_id;
  const token = req.workspace.wa_token;
  if (!phoneId || !token) return res.status(400).json({ error: 'Primero guarda la conexión (Phone Number ID y token) arriba.' });
  if (!/^\d{6}$/.test(String(pin || ''))) return res.status(400).json({ error: 'El PIN debe ser exactamente 6 dígitos.' });
  const steps = [];
  // 1) Suscribir la app a la WABA (para RECIBIR mensajes)
  if (waba_id) {
    await q('UPDATE workspaces SET wa_waba_id=$1 WHERE id=$2', [String(waba_id).trim(), req.workspace.id]);
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${String(waba_id).trim()}/subscribed_apps`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
      });
      const d = await r.json();
      if (d.error) steps.push('⚠️ Suscribir app a la WABA: ' + d.error.message);
      else steps.push('✅ App suscrita a la cuenta de WhatsApp (recibirá mensajes).');
    } catch (e) { steps.push('⚠️ No pude suscribir la app a la WABA.'); }
  }
  // 2) Registrar el número en Cloud API (para ENVIAR)
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/register`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: String(pin) }),
    });
    const d = await r.json();
    if (d.error) {
      const msg = d.error.message || 'Error al registrar';
      const already = /already/i.test(msg) || d.error.code === 100 && /registered/i.test(msg);
      if (already) { steps.push('✅ El número ya estaba registrado.'); return res.json({ ok: true, steps }); }
      const pinIssue = /pin|two.?step|verification|139/i.test(msg + (d.error.error_subcode || ''));
      const hint = pinIssue ? ' — El PIN no coincide con el que tiene el número. Restablécelo en WhatsApp Manager (llega un código por SMS al número) y reintenta con el PIN nuevo.' : '';
      return res.status(400).json({ error: 'Registro: ' + msg + hint, steps });
    }
    steps.push('✅ Número registrado en la API (podrá enviar).');
    return res.json({ ok: true, steps });
  } catch (e) { return res.status(400).json({ error: 'No pude conectar con Meta para registrar el número.', steps }); }
}));

// Re-verificación del número (error #133006): Meta manda un código por SMS/voz y hay que confirmarlo.
app.post('/api/cloud/request-code', auth(async (req, res) => {
  const phoneId = req.workspace.wa_phone_number_id;
  const token = req.workspace.wa_token;
  if (!phoneId || !token) return res.status(400).json({ error: 'Primero guarda la conexión (Phone Number ID y token) arriba.' });
  const method = (req.body && req.body.method) === 'VOICE' ? 'VOICE' : 'SMS';
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/request_code`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_method: method, language: 'es' }),
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: (d.error.error_user_msg || d.error.message) + (d.error.error_subcode ? ' (#' + d.error.error_subcode + ')' : '') });
    res.json({ ok: true, method });
  } catch (e) { return res.status(400).json({ error: 'No pude pedir el código a Meta.' }); }
}));
app.post('/api/cloud/verify-code', auth(async (req, res) => {
  const phoneId = req.workspace.wa_phone_number_id;
  const token = req.workspace.wa_token;
  const code = String((req.body && req.body.code) || '').replace(/[^0-9]/g, '');
  if (!phoneId || !token) return res.status(400).json({ error: 'Primero guarda la conexión.' });
  if (!code) return res.status(400).json({ error: 'Escribe el código que te llegó por SMS.' });
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/verify_code`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: (d.error.error_user_msg || d.error.message) + (d.error.error_subcode ? ' (#' + d.error.error_subcode + ')' : '') });
    res.json({ ok: true });
  } catch (e) { return res.status(400).json({ error: 'No pude verificar el código.' }); }
}));

app.post('/api/cloud/config', auth(async (req, res) => {
  const { phone_number_id, access_token, verify_token } = req.body || {};
  if (!phone_number_id || !access_token || !verify_token) return res.status(400).json({ error: 'Faltan datos (Phone Number ID, token y verify token)' });
  // Guarda las credenciales EN LA MARCA (cada país su propio número). El verify token es del webhook (compartido).
  await q('UPDATE workspaces SET wa_phone_number_id=$1, wa_token=$2, wa_connected=true WHERE id=$3',
    [String(phone_number_id).trim(), String(access_token).trim(), req.workspace.id]);
  await setSetting('wa_verify_token', verify_token);
  res.json({ connected: true });
}));
app.post('/api/cloud/disconnect', auth(async (req, res) => {
  await q('UPDATE workspaces SET wa_connected=false WHERE id=$1', [req.workspace.id]);
  res.json({ connected: false });
}));

// Diagnóstico de ENTREGA: envía un mensaje de prueba y devuelve la respuesta REAL de Meta
app.get('/api/cloud/last-error', auth(async (req, res) => {
  res.json({ error: (await getSetting('wa_last_error')) || '' });
}));
app.post('/api/cloud/test-send', auth(async (req, res) => {
  let { to, text } = req.body || {};
  to = String(to || '').replace(/[^0-9]/g, '');
  if (!to) return res.status(400).json({ error: 'Pon el número (con código de país, sin +). Ej: 521...' });
  const out = await sendWaResult(req.workspace, to, { type: 'text', text: { body: text || '✅ Prueba de envío desde PDFmania. Si ves esto, el envío funciona.' } });
  if (!out.ok) return res.status(400).json({ error: out.error });
  res.json({ ok: true, id: out.id });
}));

// Verificación del webhook (Meta hace un GET al conectar)
app.get('/api/webhooks/whatsapp', h(async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = await getSetting('wa_verify_token');
  if (mode === 'subscribe' && token && token === expected) return res.status(200).send(challenge);
  return res.sendStatus(403);
}));

// Recepción de mensajes entrantes de WhatsApp
app.post('/api/webhooks/whatsapp', h(async (req, res) => {
  res.sendStatus(200); // responder rápido a Meta
  try {
    const entries = (req.body && req.body.entry) || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        const value = change.value || {};
        // RUTEO MULTIPAÍS: el número que RECIBIÓ el mensaje viene en metadata.phone_number_id.
        // Buscamos la marca (país) dueña de ese número; así MX, AR, etc. conviven en el mismo webhook.
        const recvPhoneId = value.metadata && value.metadata.phone_number_id;
        let ws = recvPhoneId ? await one('SELECT * FROM workspaces WHERE wa_phone_number_id=$1', [String(recvPhoneId)]) : null;
        if (!ws) { console.error('[webhook] sin marca para phone_number_id', recvPhoneId); continue; }
        const wsId = ws.id;
        const contacts = value.contacts || [];
        const nameByWa = {};
        contacts.forEach(c => { nameByWa[c.wa_id] = c.profile && c.profile.name; });
        for (const m of (value.messages || [])) {
          const from = m.from;
          // Dedup: WhatsApp a veces reenvía el mismo webhook. Ignoramos ids ya vistos (evita respuestas/guiones dobles).
          if (m.id) { if (_seenMsgIds.has(m.id)) continue; _seenMsgIds.add(m.id); if (_seenMsgIds.size > 5000) _seenMsgIds.clear(); }
          // Texto normal, o el título del botón/lista si el cliente tocó un botón interactivo
          let body;
          if (m.text) body = m.text.body;
          else if (m.type === 'interactive' && m.interactive) { const ir = m.interactive.button_reply || m.interactive.list_reply; body = ir ? (ir.title || ir.id) : '[interactive]'; }
          else if (m.type === 'button' && m.button) body = m.button.text || '[button]';
          else body = '[' + (m.type || 'mensaje') + ']';
          const name = nameByWa[from] || from;
          // El cliente respondió: marca last_in_at y pausa/reancla el reloj de seguimiento.
          const conv = await one(
            `INSERT INTO conversations (workspace_id,wa_id,name,last_message,last_at,last_in_at,followup_at,unread,bot_active)
             VALUES ($1,$2,$3,$4,now(),now(),now(),1,true)
             ON CONFLICT (workspace_id,wa_id) DO UPDATE SET last_message=$4, last_at=now(), last_in_at=now(), followup_at=now(), unread=conversations.unread+1, name=COALESCE(conversations.name,$3)
             RETURNING id, bot_active`, [wsId, from, name, body]);
          // Click-to-WhatsApp: si el lead llegó desde un anuncio, guarda el ctwa_clid (para atribuir la compra a ese anuncio).
          const ref = m.referral;
          if (ref && (ref.ctwa_clid || ref.source_id)) {
            const adRef = [ref.source_id, ref.headline].filter(Boolean).join(' · ').slice(0, 300);
            await q('UPDATE conversations SET ctwa_clid=COALESCE(ctwa_clid,$1), ad_ref=COALESCE(ad_ref,$2) WHERE id=$3',
              [ref.ctwa_clid || null, adRef || null, conv.id]).catch(() => {});
            // Dispara "Lead" a Meta CAPI de inmediato: activa el dataset y mide costo por lead sin esperar la venta.
            fireCapiLead(ws, conv.id).catch(() => {});
          }
          // ¿Trae imagen o documento? -> guardamos el archivo para poder VERLO en el chat (cualquier tipo).
          const mediaObj = (m.type === 'image' && m.image) ? m.image
            : (m.type === 'document' && m.document) ? m.document
            : (m.type === 'sticker' && m.sticker) ? m.sticker : null;
          const mediaId = mediaObj && mediaObj.id ? mediaObj.id : null;
          let mediaUrl = null, preMedia = null;
          if (mediaId) {
            try {
              preMedia = await downloadWaMedia(ws, mediaId);
              if (preMedia && preMedia.base64) {
                const base = (await getSetting('public_url')) || (req.protocol + '://' + req.get('host'));
                const size = Math.round(preMedia.base64.length * 3 / 4);
                const tok = crypto.randomBytes(12).toString('hex');
                const mrow = await one('INSERT INTO media (workspace_id,name,mime,category,data,size,token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
                  [wsId, 'comprobante-' + from, preMedia.mediaType, 'comprobante', preMedia.base64, size, tok]);
                mediaUrl = base + '/api/media/file/' + mrow.id + '?t=' + tok;
              }
            } catch (e) { console.error('save media error', e.message); }
          }
          await q('INSERT INTO messages (conversation_id,direction,body,type,wa_message_id,media_url) VALUES ($1,$2,$3,$4,$5,$6)',
            [conv.id, 'in', body, m.type || 'text', m.id || null, mediaUrl]);
          // Comprobante (imagen/PDF) -> verificar; texto -> flujos o agente IA
          if (mediaId) {
            await q("UPDATE conversations SET stage='pago' WHERE id=$1 AND stage <> 'cliente'", [conv.id]);
            processIncomingReceipt(wsId, conv.id, from, mediaId, preMedia).catch(e => console.error('receipt error', e));
          } else if (m.type === 'audio' && m.audio && m.audio.id && conv.bot_active) {
            // Nota de voz -> transcribir y responder como si fuera texto (¡no dejarla en visto!)
            transcribeAndHandle(ws, conv.id, from, m.audio.id, m.id).catch(e => console.error('voice error', e.message));
          } else if (conv.bot_active && ws && (m.type === 'text' || m.text || m.type === 'interactive' || m.type === 'button')) {
            handleBotResponse(ws, { id: conv.id, bot_active: conv.bot_active }, from, body).catch(e => console.error('bot error', e));
          }
        }
      }
    }
  } catch (e) { console.error('webhook wa error', e); }
}));

// ---------- Chat en Vivo ----------
app.get('/api/chat/conversations', auth(async (req, res) => {
  const list = await many('SELECT * FROM conversations WHERE workspace_id=$1 ORDER BY last_at DESC LIMIT 200', [req.workspace.id]);
  res.json({ conversations: list });
}));

app.get('/api/chat/conversation/:id', auth(async (req, res) => {
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const msgs = await many('SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 500', [conv.id]);
  await q('UPDATE conversations SET unread=0 WHERE id=$1', [conv.id]);
  res.json({ conversation: conv, messages: msgs });
}));

app.post('/api/chat/send', auth(async (req, res) => {
  const { conversation_id, text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Texto requerido' });
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [conversation_id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

  const { phoneId, token } = waCreds(req.workspace);
  let waMsgId = null, simulated = false;
  if (phoneId && token && req.workspace.wa_connected) {
    const out = await sendWaResult(req.workspace, conv.wa_id, { type: 'text', text: { body: text } });
    if (!out.ok) return res.status(502).json({ error: out.error || 'Error enviando a WhatsApp' });
    waMsgId = out.id;
  } else {
    simulated = true; // sin conexión real: se guarda localmente (modo demo)
  }
  await q('INSERT INTO messages (conversation_id,direction,body,type,wa_message_id) VALUES ($1,$2,$3,$4,$5)', [conv.id, 'out', text, 'text', waMsgId]);
  await q('UPDATE conversations SET last_message=$1, last_at=now() WHERE id=$2', [text, conv.id]);
  res.json({ ok: true, simulated });
}));

app.post('/api/chat/takeover', auth(async (req, res) => {
  const { conversation_id, bot_active } = req.body || {};
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [conversation_id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  await q('UPDATE conversations SET bot_active=$1 WHERE id=$2', [!!bot_active, conv.id]);
  res.json({ ok: true, bot_active: !!bot_active });
}));

// Cambiar manualmente la etapa del cliente
app.post('/api/chat/conversation/:id/stage', auth(async (req, res) => {
  const { stage } = req.body || {};
  const ok = ['nuevo', 'conversando', 'pago', 'cliente'];
  if (!ok.includes(stage)) return res.status(400).json({ error: 'Etapa inválida' });
  const conv = await one('SELECT id FROM conversations WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'No encontrado' });
  await q('UPDATE conversations SET stage=$1 WHERE id=$2', [stage, conv.id]);
  res.json({ ok: true, stage });
}));

// Etiquetas de una conversación (añadir/quitar a mano; la IA también las pone sola)
app.post('/api/chat/conversation/:id/tags', auth(async (req, res) => {
  const conv = await one('SELECT id FROM conversations WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'No encontrado' });
  if (Array.isArray(req.body.add)) await addConvTags(conv.id, req.body.add);
  if (Array.isArray(req.body.remove)) await removeConvTags(conv.id, req.body.remove);
  const row = await one('SELECT tags FROM conversations WHERE id=$1', [conv.id]);
  res.json({ ok: true, tags: (row && row.tags) || [] });
}));
// Todas las etiquetas usadas en esta marca (para filtrar / autocompletar)
app.get('/api/chat/tags', auth(async (req, res) => {
  const rows = await many("SELECT DISTINCT jsonb_array_elements_text(tags) t FROM conversations WHERE workspace_id=$1 AND tags IS NOT NULL AND jsonb_typeof(tags)='array'", [req.workspace.id]).catch(() => []);
  res.json({ tags: rows.map(r => r.t).filter(Boolean).sort() });
}));

// Registrar/editar la venta de una conversación (manual, eligiendo producto y precio)
app.post('/api/chat/conversation/:id/sale', auth(async (req, res) => {
  const { product_id, amount } = req.body || {};
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  let pid = product_id ? parseInt(product_id, 10) : null;
  let pname = 'Venta manual';
  let amt = Number(amount);
  if (pid) {
    const p = await one('SELECT * FROM products WHERE id=$1 AND workspace_id=$2', [pid, req.workspace.id]);
    if (p) { pname = p.name; if (!amt || isNaN(amt)) amt = Number(p.price); }
    else pid = null;
  }
  if (!amt || isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Pon un precio de venta válido.' });
  amt = Math.round(amt);
  // Evita duplicar: si ya hay venta para esta conversación, la actualiza
  const existing = await one('SELECT id FROM sales WHERE workspace_id=$1 AND conversation_id=$2', [req.workspace.id, conv.id]);
  let saleId;
  if (existing) {
    await q('UPDATE sales SET product_id=$1, product_name=$2, amount=$3 WHERE id=$4', [pid, pname, amt, existing.id]);
    saleId = existing.id;
  } else {
    const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source,conversation_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.workspace.id, pid, pname, amt, conv.name || 'Cliente', 'manual', conv.id]);
    saleId = s.id;
  }
  await q("UPDATE conversations SET stage='cliente' WHERE id=$1", [conv.id]);
  if (!existing) notifySale(req.workspace, pname, amt, 'manual');
  fireCapiPurchase(req.workspace, conv.id, amt, req.workspace.currency).catch(() => {});
  res.json({ ok: true, sale: { id: saleId, product_name: pname, amount: amt } });
}));

// ---------- Inteligencia IA (Claude) ----------
app.get('/api/iaconfig/ia-config', auth(async (req, res) => {
  const ws = req.workspace;
  // API key y modelo son GLOBALES (compartidos). El agente (nombre/tono/instrucciones) es POR PAÍS.
  res.json({
    connected: !!(await getSetting('anthropic_key')),
    model: (await getSetting('anthropic_model')) || 'claude-sonnet-5',
    has_openai: !!(await getSetting('openai_key')),
    image_model: (await getSetting('image_model')) || 'gpt-image-1',
    ai_provider: (await getSetting('ai_provider')) || 'anthropic',
    openai_chat_model: (await getSetting('openai_chat_model')) || 'gpt-4o',
    agent_name: ws.agent_name || 'Sofía',
    agent_tone: ws.agent_tone || 'cercano, amable y persuasivo, estilo WhatsApp',
    agent_instructions: ws.agent_instructions || '',
    agent_lang: ws.agent_lang || (ws.country_code === 'BR' ? 'pt' : 'es'),
    workspace_name: ws.name, flag: ws.flag,
  });
}));
app.post('/api/iaconfig/ia-config', auth(async (req, res) => {
  const { api_key, model, agent_name, agent_tone, agent_instructions, agent_lang, openai_key, image_model } = req.body || {};
  if (api_key) await setSetting('anthropic_key', api_key);   // global
  if (model) await setSetting('anthropic_model', model);      // global
  if (openai_key) await setSetting('openai_key', openai_key); // global (imágenes)
  if (image_model) await setSetting('image_model', image_model);
  if (req.body.ai_provider === 'openai' || req.body.ai_provider === 'anthropic') await setSetting('ai_provider', req.body.ai_provider);
  if (req.body.openai_chat_model) await setSetting('openai_chat_model', String(req.body.openai_chat_model).trim());
  // Agente personalizado por país (marca):
  if (agent_name !== undefined || agent_tone !== undefined || agent_instructions !== undefined || agent_lang !== undefined) {
    await q('UPDATE workspaces SET agent_name=COALESCE($1,agent_name), agent_tone=COALESCE($2,agent_tone), agent_instructions=COALESCE($3,agent_instructions), agent_lang=COALESCE($4,agent_lang) WHERE id=$5',
      [agent_name !== undefined ? agent_name : null, agent_tone !== undefined ? agent_tone : null, agent_instructions !== undefined ? agent_instructions : null, agent_lang !== undefined ? agent_lang : null, req.workspace.id]);
  }
  res.json({ connected: !!(await getSetting('anthropic_key')) });
}));

// ============================================================================
//  FÁBRICA DE TESTEO  —  investigación de productos + creativos + auto-flujos
// ============================================================================
// Extrae el primer JSON (array u objeto) de un texto de la IA. Tolera fences y JSON truncado.
function extractJson(text) {
  if (!text) return null;
  const t = String(text).replace(/```json/gi, '').replace(/```/g, '');
  // Ancla en el PRIMER corchete/llave real (el nivel superior), no en un fragmento interno.
  const cands = [t.indexOf('{'), t.indexOf('[')].filter(x => x >= 0);
  if (!cands.length) return null;
  const raw = t.slice(Math.min(...cands));
  const closeFor = st => { let c = ''; for (let j = st.length - 1; j >= 0; j--) c += (st[j] === '[' ? ']' : '}'); return c; };
  // Recorre con pila. En cada valor COMPLETO (cierre de } ] o de un string) guarda un punto de corte seguro
  // con el estado de la pila, para poder recortar una propiedad truncada al final.
  const snaps = []; const stack = []; let inStr = false, esc = false, endStack = null;
  for (let k = 0; k < raw.length; k++) {
    const ch = raw[k];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; if (!inStr) snaps.push({ pos: k, st: stack.slice() }); continue; }
    if (inStr) continue;
    if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ']' || ch === '}') { stack.pop(); snaps.push({ pos: k, st: stack.slice() }); }
  }
  endStack = stack.slice();
  const tries = [];
  // Candidatos: del corte más largo al más corto (recorta la propiedad truncada del final).
  for (let i = snaps.length - 1; i >= 0; i--) {
    const s = snaps[i];
    tries.push(raw.slice(0, s.pos + 1).replace(/,\s*$/, '') + closeFor(s.st));
  }
  // Fallback: colon colgante -> null, y cierre de string abierto.
  tries.push(raw.replace(/,\s*$/, '').replace(/:\s*$/, ':null') + closeFor(endStack));
  tries.push(raw + (inStr ? '"' : '') + closeFor(endStack));
  tries.push(raw);
  for (const cand of tries) { try { const v = JSON.parse(cand); if (v && typeof v === 'object') return v; } catch (e) {} }
  return null;
}

// Genera una imagen con la API de imágenes de OpenAI (llave que pega el usuario en Ajustes).
async function generateImage(prompt, size, quality) {
  const key = await getSetting('openai_key');
  if (!key) return { error: 'nokey' };
  const model = (await getSetting('image_model')) || 'gpt-image-1';
  const body = { model, prompt: String(prompt || '').slice(0, 28000), size: size || '1024x1024', n: 1 };
  // Calidad: 'high' mejora bastante la nitidez y la ORTOGRAFÍA del texto (gpt-image-1).
  if (quality && /^(low|medium|high)$/.test(quality)) body.quality = quality;
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) return { error: (d.error && d.error.message) || ('Error de imagen (' + r.status + ')') };
    const item = (d.data && d.data[0]) || {};
    if (item.b64_json) return { b64: item.b64_json };
    if (item.url) {
      try { const ib = await fetch(item.url).then(x => x.arrayBuffer()); return { b64: Buffer.from(ib).toString('base64') }; }
      catch (e) { return { url: item.url }; }
    }
    return { error: 'La API no devolvió imagen' };
  } catch (e) { return { error: 'No pude conectar con la API de imágenes' }; }
}

// País -> nombre legible (reusa COUNTRY_NAMES); idioma por país
function labLang(cc) { return cc === 'BR' ? 'portugués de Brasil' : 'español'; }

// 1) INVESTIGACIÓN: la IA propone productos/nichos/ángulos candidatos a testear.
app.post('/api/lab/research', auth(async (req, res) => {
  const b = req.body || {};
  const cc = (b.country || req.workspace.country_code || '').toUpperCase();
  const paisName = COUNTRY_NAMES[cc] || cc || 'LATAM';
  const count = Math.max(1, Math.min(8, parseInt(b.count, 10) || 5));
  const notes = String(b.notes || '').slice(0, 800);
  // Ganadores históricos como contexto (productos con más revenue)
  let winners = [];
  try {
    winners = await many(
      `SELECT product_name, COUNT(*)::int u, COALESCE(SUM(amount),0)::float8 s
       FROM sales s JOIN workspaces w ON w.id=s.workspace_id
       WHERE w.user_id=$1 AND product_name IS NOT NULL
       GROUP BY product_name ORDER BY u DESC LIMIT 12`, [req.accountId]);
  } catch (e) { winners = []; }
  const winTxt = winners.length ? winners.map(w => `- ${w.product_name} (${w.u} ventas)`).join('\n') : '(sin histórico aún)';
  const sys = `Eres un estratega de performance marketing y descubrimiento de productos para PDFmania, una empresa que vende MANUALES y GUÍAS digitales en PDF (mecánica automotriz, motos, oficios, cursos técnicos) por WhatsApp + Meta Ads en LATAM. Tu trabajo es proponer NUEVOS productos/nichos/ángulos con alto potencial de ser ganadores para testear con anuncios. Piensa en demanda real, dolor del cliente, facilidad de producir el PDF y capacidad de generar compra impulsiva de bajo ticket.`;
  const user = `País objetivo: ${paisName}.
Productos que ya venden (para NO repetir y para inspirarte en lo que funciona):
${winTxt}
${notes ? '\nNotas del dueño: ' + notes : ''}

Propón ${count} ideas de producto para testear en ${paisName}. Devuelve SOLO un JSON array (sin texto extra), cada objeto con esta forma exacta:
[{"name":"nombre del producto (corto y vendedor)","niche":"nicho/audiencia","angle":"ángulo publicitario principal para el anuncio","price_hint":"rango de precio sugerido en USD","rationale":"por qué puede ser ganador (1-2 frases)","score":0-100}]
Ordena de mayor a menor score (potencial).`;
  const out = await callClaudeConversation(sys, [{ role: 'user', content: user }], 3000);
  if (out.error === 'nokey') return res.status(400).json({ error: 'Conecta tu API Key de Claude en Inteligencia IA para usar la Fábrica.' });
  if (out.error) return res.status(400).json({ error: out.error });
  const ideas = extractJson(out.text);
  if (!Array.isArray(ideas)) return res.status(400).json({ error: 'La IA no devolvió ideas válidas, reintenta.' });
  const saved = [];
  for (const it of ideas.slice(0, count)) {
    if (!it || !it.name) continue;
    const row = await one(
      `INSERT INTO lab_ideas (account_id,workspace_id,country_code,name,niche,angle,price_hint,rationale,score,source,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ia','idea') RETURNING *`,
      [req.accountId, b.workspace_id || null, cc || null, String(it.name).slice(0, 160),
       String(it.niche || '').slice(0, 200), String(it.angle || '').slice(0, 300),
       String(it.price_hint || '').slice(0, 60), String(it.rationale || '').slice(0, 500),
       Math.max(0, Math.min(100, parseInt(it.score, 10) || 0))]);
    saved.push(row);
  }
  res.json({ ideas: saved });
}));

// Lista / tablero de ideas (compartido por el equipo)
app.get('/api/lab/ideas', auth(async (req, res) => {
  const rows = await many('SELECT * FROM lab_ideas WHERE account_id=$1 ORDER BY (status), score DESC, id DESC', [req.accountId]);
  res.json({ ideas: rows });
}));
// Crear/editar idea manual o mover de etapa
app.post('/api/lab/idea', auth(async (req, res) => {
  const b = req.body || {};
  const VALID = ['idea', 'creativos', 'flujo', 'testeo', 'ganador', 'muerto'];
  if (b.id) {
    const st = VALID.includes(b.status) ? b.status : null;
    await q('UPDATE lab_ideas SET name=COALESCE($1,name), niche=COALESCE($2,niche), angle=COALESCE($3,angle), price_hint=COALESCE($4,price_hint), status=COALESCE($5,status), country_code=COALESCE($6,country_code) WHERE id=$7 AND account_id=$8',
      [b.name || null, b.niche || null, b.angle || null, b.price_hint || null, st, b.country ? String(b.country).toUpperCase() : null, b.id, req.accountId]);
    return res.json({ id: b.id });
  }
  if (!b.name) return res.status(400).json({ error: 'Falta el nombre' });
  const row = await one('INSERT INTO lab_ideas (account_id,country_code,name,niche,angle,price_hint,rationale,source,status) VALUES ($1,$2,$3,$4,$5,$6,$7,\'manual\',\'idea\') RETURNING *',
    [req.accountId, b.country ? String(b.country).toUpperCase() : null, String(b.name).slice(0, 160), String(b.niche || '').slice(0, 200), String(b.angle || '').slice(0, 300), String(b.price_hint || '').slice(0, 60), String(b.rationale || '').slice(0, 500)]);
  res.json({ idea: row });
}));
app.post('/api/lab/idea/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM lab_ideas WHERE id=$1 AND account_id=$2', [req.params.id, req.accountId]);
  res.json({ ok: true });
}));

// 2) CREATIVOS: la IA genera conceptos (gancho + copy + prompt visual) y opcionalmente la imagen.
app.post('/api/lab/creatives', auth(async (req, res) => {
  const b = req.body || {};
  const cc = (b.country || req.workspace.country_code || '').toUpperCase();
  const paisName = COUNTRY_NAMES[cc] || cc || 'LATAM';
  const product = String(b.product || '').slice(0, 160);
  const angle = String(b.angle || '').slice(0, 300);
  if (!product) return res.status(400).json({ error: 'Falta el producto' });
  const count = Math.max(1, Math.min(4, parseInt(b.count, 10) || 2));
  const genImg = b.generate_image !== false; // por defecto genera imagen si hay llave
  const brand = String(b.brand_style || 'Línea gráfica PDFmania: fondo negro, alto contraste, tipografía bold, estética premium y limpia, foco en el producto, look moderno de anuncio de Meta que convierte.').slice(0, 600);
  const sys = `Eres director creativo de performance para PDFmania (manuales/guías PDF por WhatsApp + Meta Ads en LATAM). Creas conceptos de anuncio que detienen el scroll y generan compra impulsiva. Escribes en ${labLang(cc)}.`;
  const user = `Producto: ${product}
País: ${paisName}
${angle ? 'Ángulo: ' + angle : ''}
Línea gráfica de marca: ${brand}

Genera ${count} conceptos de creativo para anuncio de Meta. Devuelve SOLO un JSON array (sin texto extra), cada objeto:
[{"headline":"titular corto y potente (máx 8 palabras)","primary_text":"texto principal del anuncio, persuasivo, con gancho, beneficios y llamado a escribir por WhatsApp (2-4 frases)","visual_prompt":"prompt detallado EN INGLÉS para generar la imagen del anuncio, respetando la línea gráfica de marca; describe composición, sujeto, estilo, colores, mood; foto realista o gráfico según convenga"}]
Adapta el idioma del headline y primary_text a ${labLang(cc)}.`;
  const out = await callClaudeConversation(sys, [{ role: 'user', content: user }], 3000);
  if (out.error === 'nokey') return res.status(400).json({ error: 'Conecta tu API Key de Claude en Inteligencia IA.' });
  if (out.error) return res.status(400).json({ error: out.error });
  const concepts = extractJson(out.text);
  if (!Array.isArray(concepts)) return res.status(400).json({ error: 'La IA no devolvió creativos válidos, reintenta.' });
  const hasOpenai = !!(await getSetting('openai_key'));
  const saved = [];
  let imgError = null;
  const base = (await getSetting('public_url')) || (req.protocol + '://' + req.get('host'));
  for (const c of concepts.slice(0, count)) {
    if (!c) continue;
    let mediaId = null, imageUrl = null;
    if (genImg && hasOpenai && c.visual_prompt) {
      const styled = c.visual_prompt + '. Style: ' + brand + ' No text overlay unless essential.';
      const img = await generateImage(styled, '1024x1024');
      if (img.b64) {
        const tok = crypto.randomBytes(12).toString('hex');
        const size = Math.round(img.b64.length * 3 / 4);
        const m = await one('INSERT INTO media (workspace_id,name,mime,category,data,size,token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [req.workspace.id, 'creativo-' + product.slice(0, 30), 'image/png', 'creativo', img.b64, size, tok]);
        mediaId = m.id; imageUrl = base + '/api/media/file/' + m.id + '?t=' + tok;
      } else if (img.url) { imageUrl = img.url; }
      else if (img.error && img.error !== 'nokey') { imgError = img.error; }
    }
    const row = await one(
      `INSERT INTO lab_creatives (account_id,idea_id,workspace_id,country_code,product,angle,headline,primary_text,visual_prompt,media_id,image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.accountId, b.idea_id || null, req.workspace.id, cc || null, product, angle,
       String(c.headline || '').slice(0, 200), String(c.primary_text || '').slice(0, 1200),
       String(c.visual_prompt || '').slice(0, 1500), mediaId, imageUrl]);
    saved.push(row);
  }
  if (b.idea_id) await q("UPDATE lab_ideas SET status='creativos' WHERE id=$1 AND account_id=$2 AND status='idea'", [b.idea_id, req.accountId]);
  res.json({ creatives: saved, image_generated: !!(genImg && hasOpenai), img_error: imgError, needs_openai_key: genImg && !hasOpenai });
}));

app.get('/api/lab/creatives', auth(async (req, res) => {
  const rows = req.query.idea_id
    ? await many('SELECT * FROM lab_creatives WHERE account_id=$1 AND idea_id=$2 ORDER BY id DESC', [req.accountId, req.query.idea_id])
    : await many('SELECT * FROM lab_creatives WHERE account_id=$1 ORDER BY id DESC LIMIT 60', [req.accountId]);
  res.json({ creatives: rows });
}));
app.post('/api/lab/creative/:id/delete', auth(async (req, res) => {
  const c = await one('SELECT media_id FROM lab_creatives WHERE id=$1 AND account_id=$2', [req.params.id, req.accountId]);
  if (c && c.media_id) await q('DELETE FROM media WHERE id=$1', [c.media_id]);
  await q('DELETE FROM lab_creatives WHERE id=$1 AND account_id=$2', [req.params.id, req.accountId]);
  res.json({ ok: true });
}));
// Regenera SOLO la imagen de un creativo (usa su visual_prompt)
app.post('/api/lab/creative/:id/image', auth(async (req, res) => {
  const c = await one('SELECT * FROM lab_creatives WHERE id=$1 AND account_id=$2', [req.params.id, req.accountId]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  if (!(await getSetting('openai_key'))) return res.status(400).json({ error: 'Pega tu llave de API de imágenes en Inteligencia IA para generar imágenes.' });
  const prompt = String((req.body && req.body.prompt) || c.visual_prompt || '');
  if (!prompt) return res.status(400).json({ error: 'Este creativo no tiene prompt visual.' });
  const img = await generateImage(prompt, '1024x1024');
  if (img.error) return res.status(400).json({ error: img.error });
  const base = (await getSetting('public_url')) || (req.protocol + '://' + req.get('host'));
  let imageUrl = img.url || null, mediaId = c.media_id;
  if (img.b64) {
    const tok = crypto.randomBytes(12).toString('hex');
    const size = Math.round(img.b64.length * 3 / 4);
    const m = await one('INSERT INTO media (workspace_id,name,mime,category,data,size,token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.workspace.id, 'creativo-' + String(c.product || '').slice(0, 30), 'image/png', 'creativo', img.b64, size, tok]);
    mediaId = m.id; imageUrl = base + '/api/media/file/' + m.id + '?t=' + tok;
  }
  await q('UPDATE lab_creatives SET media_id=$1, image_url=$2 WHERE id=$3', [mediaId, imageUrl, c.id]);
  res.json({ image_url: imageUrl });
}));

// Moneda y método de pago por país (defaults; editables por el usuario)
const CUR_BY_CC = { MX: 'MXN', CO: 'COP', AR: 'ARS', CR: 'CRC', GT: 'GTQ', DO: 'DOP', VE: 'VES', BR: 'BRL', PE: 'PEN', EC: 'USD', CL: 'CLP', PA: 'USD', BO: 'BOB', PY: 'PYG', UY: 'UYU', US: 'USD' };
const PAY_BY_CC = { CO: 'Nequi', AR: 'Naranja X', MX: 'Mercado Pago', VE: 'Pago Móvil', BR: 'PIX', DO: 'Transferencia bancaria', CR: 'SINPE Móvil', GT: 'Transferencia bancaria', PE: 'Yape', EC: 'Transferencia', CL: 'Transferencia', PA: 'Transferencia', US: 'Zelle' };
function fmtMoney(n, cc) {
  const v = Math.round(Number(n) || 0);
  try { return new Intl.NumberFormat('es-CO').format(v); } catch (e) { return String(v); }
}

// Las 6 piezas de la serie (fiel a la dirección de arte del dueño).
const AD_PIECES = [
  { key: 'hero',    label: 'Portada / Hero',        brief: 'PORTADA HERO — la imagen MÁS impactante. Muestra el nombre del producto ARRIBA muy grande, el hook principal, un mockup grande (laptop+tablet+celular con el contenido), 3-4 beneficios cortos con checkmarks, el PRECIO enorme, el logo del método de pago, y un CTA grande.' },
  { key: 'incluye', label: 'Todo lo que incluye',   brief: 'TODO LO QUE INCLUYE — título "TODO LO QUE INCLUYE". Checklist visual de 5-7 items incluidos (con ✅), mockup del producto en dispositivos, precio y método de pago abajo, CTA.' },
  { key: 'testi',   label: 'Testimonios',           brief: 'PRUEBA SOCIAL — título "LO QUE DICEN LOS CLIENTES". 3 tarjetas de testimonio, cada una con 5 estrellas, comentario breve, nombre y ciudad local. Naturales, sin cifras verificables. Mockup visible, precio y pago, CTA.' },
  { key: 'oferta',  label: 'Oferta especial',       brief: 'OFERTA ESPECIAL — título dominante "🔥 OFERTA ESPECIAL 🔥". Si hay precio anterior, tachado en rojo arriba; luego "HOY SOLO" + precio EXTREMADAMENTE grande. 3 beneficios (acceso inmediato/digital/de por vida si aplican), mockup, método de pago, CTA enorme. Estilo respuesta directa alta conversión.' },
  { key: 'recibes', label: 'Cómo lo recibes',       brief: 'CÓMO LO RECIBES — título "CÓMO LO RECIBES". Proceso de 3 pasos numerados (1 pagas con {metodo}, 2 recibes acceso por WhatsApp, 3 descargas y empiezas), con flechas. Texto destacado "ACCESO INMEDIATO", dispositivos con contenido, precio, CTA "PÍDELO AHORA".' },
  { key: 'faq',     label: 'Preguntas frecuentes',  brief: 'PREGUNTAS FRECUENTES — título "PREGUNTAS FRECUENTES". 4 preguntas cortas con respuesta de 1-2 líneas (¿sirve para principiantes? ¿es digital? ¿cuándo lo recibo? ¿cómo pago?). Mockup del producto, precio, método de pago, CTA.' },
];

// Núcleo de estilo (dirección de arte del dueño, condensada y fiel).
function adStyleCore() {
  return `Eres director de arte y diseñador publicitario de anuncios PREMIUM de infoproductos low-ticket para Meta Ads y WhatsApp.
FORMATO: imagen cuadrada 1080x1080, alta conversión, composición equilibrada, funciona sola.
ESTÉTICA: premium, cinematográfica, comercial, moderna, muy llamativa, gran profundidad, iluminación dramática, alto contraste, detalles metálicos, bordes luminosos, sombras profundas, texturas del nicho, sensación de alto valor.
PROHIBIDO: minimalista, plantilla genérica de Canva, flat design, pastel genérico, estilo caricatura/infantil, tipografía delgada, fondos planos sin profundidad, diseño barato o improvisado.
TIPOGRAFÍA: tipo Montserrat ExtraBold / Anton / Bebas Neue / Gotham Bold. Títulos MUY GRANDES, gruesos, condensados, con leve 3D, sombras y relieve metálico. Todo legible desde un celular. Evita bloques enormes de texto.
JERARQUÍA: 1) hook/nombre 2) precio 3) beneficio principal 4) mockup 5) método de pago 6) CTA.
MOCKUP: el producto digital debe verse físicamente valioso (caja 3D / libro / PDFs abiertos con páginas interiores/diagramas) y cuando se pueda mostrarlo en LAPTOP + TABLET + CELULAR a la vez. El mockup ocupa parte importante del creativo.
PRECIO: es uno de los elementos MÁS GRANDES, con marco premium y alto contraste. No inventes un precio anterior si no se dio.
PAGO: muestra "PAGA CON {metodo}" con el logo correcto del método. No inventes bancos ni cambies el nombre del método.
COMPOSICIÓN: usa marcos, badges, iconografía, divisores, tarjetas, flechas, números, checkmarks, iluminación LED, reflejos y brillos controlados. Abundante pero MUY ORGANIZADA, nivel diseñador profesional de performance marketing.
TEXTO: TODO el texto perfectamente escrito, sin inventar palabras ni deformar números. Precio, moneda, país, nombre del producto y método de pago EXACTOS.
EVITAR (negative): cheap Canva design, minimalist template, flat design, pastel generic, cartoon, childish, thin/illegible/misspelled text, wrong currency/price, fake or distorted payment logos, random letters, oversaturated rainbow, empty background, low contrast, poor alignment, low resolution, cropped text, duplicated/deformed elements.`;
}

// Construye el prompt final de UNA pieza a partir de la identidad + brief + pieza.
function buildAdPrompt(idy, brief, piece) {
  const b = brief || {};
  const beneficios = Array.isArray(b.beneficios) ? b.beneficios.slice(0, 8).join(' | ') : '';
  const contenido = Array.isArray(b.contenido) ? b.contenido.slice(0, 8).join(' | ') : '';
  const testi = Array.isArray(b.testimonios) ? b.testimonios.slice(0, 3).map(t => `"${t.texto || ''}" — ${t.nombre || ''}, ${t.ciudad || ''}`).join(' || ') : '';
  const faq = Array.isArray(b.faq) ? b.faq.slice(0, 4).map(f => `${f.q || ''} -> ${f.a || ''}`).join(' || ') : '';
  const pieceSpec = (piece.brief || '').replace('{metodo}', idy.metodo_pago);
  return `${adStyleCore()}

=== IDENTIDAD DE ESTA CAMPAÑA (idéntica en toda la serie) ===
PRODUCTO: ${idy.product}
DESCRIPCIÓN: ${idy.description || ''}
PAÍS: ${idy.pais} (localiza: moneda, bandera sutil, ciudades y vocabulario locales)
IDIOMA DE TODO EL TEXTO: ${idy.idioma}
PRECIO (mostrar EXACTO): ${idy.precio} ${idy.moneda}${b.precio_anterior ? '  |  PRECIO ANTERIOR (tachado en rojo): ' + b.precio_anterior + ' ' + idy.moneda : ''}
MÉTODO DE PAGO (logo correcto, EXACTO): ${idy.metodo_pago}
PALETA OBLIGATORIA (usa EXACTAMENTE estos colores en toda la serie): ${idy.style || b.paleta || ((b.color_principal || 'negro') + ', ' + (b.color_secundario || 'rojo'))}
La paleta debe REPRESENTAR el nicho del producto (ej. salud/farmacia = azul clínico, blanco, verde; NO uses rojo de taller si no es automotriz). El fondo y los acentos deben ser coherentes con esa paleta.
CTA: ${b.cta || idy.cta || 'ESCRIBE "QUIERO"'}
CONTENIDO INCLUIDO: ${contenido}
BENEFICIOS: ${beneficios}
PÚBLICO: ${b.publico || idy.publico || ''}
${testi ? 'TESTIMONIOS (solo para la pieza de prueba social): ' + testi : ''}
${faq ? 'FAQ (solo para la pieza de FAQ): ' + faq : ''}

=== PIEZA A GENERAR (${piece.label}) ===
${pieceSpec}

ORTOGRAFÍA (CRÍTICO): TODO el texto perfectamente escrito en ${idy.idioma}, con acentos y ñ correctos. NO inventes palabras, NO repitas letras, NO deformes números. Usa MENOS texto pero impecable: títulos y frases cortas, legibles. Cada palabra debe ser real y estar bien escrita. Revisa el precio (${idy.precio} ${idy.moneda}) y el método de pago (${idy.metodo_pago}) letra por letra.
Genera UNA sola imagen 1080x1080 lista para anuncio de Meta Ads / WhatsApp. Máxima nitidez.`;
}

// Resuelve la identidad de campaña desde el workspace/país + datos del body.
async function resolveAdIdentity(ws, body) {
  const cc = (body.country || ws.country_code || '').toUpperCase();
  const lang = ws.agent_lang || (cc === 'BR' ? 'pt' : 'es');
  const moneda = ws.country_code === cc ? (ws.currency || CUR_BY_CC[cc] || 'USD') : (CUR_BY_CC[cc] || 'USD');
  let metodo = String(body.payment || '').trim();
  if (!metodo) {
    const pm = await one('SELECT label,detail,type FROM payment_methods WHERE workspace_id=$1 ORDER BY id LIMIT 1', [ws.id]);
    if (pm) metodo = pm.label || pm.detail || PAY_BY_CC[cc] || 'Transferencia';
    else metodo = PAY_BY_CC[cc] || 'Transferencia bancaria';
  }
  return {
    cc, product: String(body.product || '').slice(0, 160),
    description: String(body.description || '').slice(0, 400),
    pais: COUNTRY_NAMES[cc] || cc,
    idioma: lang === 'pt' ? 'português (Brasil)' : 'español',
    precio: fmtMoney(body.price, cc), moneda,
    metodo_pago: metodo,
    style: String(body.style || '').slice(0, 300),
    cta: lang === 'pt' ? 'ESCREVA "QUERO"' : 'ESCRIBE "QUIERO"',
  };
}

// SERIE DE ANUNCIOS · paso 1: la IA arma el brief de campaña (contenido, beneficios, testimonios, FAQ, colores)
app.post('/api/lab/adseries/brief', auth(async (req, res) => {
  const b = req.body || {};
  if (!b.product) return res.status(400).json({ error: 'Falta el producto' });
  const idy = await resolveAdIdentity(req.workspace, b);
  const sys = `Eres estratega creativo de PDFmania (infoproductos PDF low-ticket por WhatsApp + Meta Ads en LATAM). Escribes copy publicitario de respuesta directa, con anclaje de valor (bonos, valor real vs precio de hoy) al estilo de este ejemplo real de la marca:
"¡Buenas! Soy [agente] del equipo PDFmania [país]. Te mando todo del [producto]... ✅ +24.000 manuales ✅ Diagramas ✅ Acceso de por vida ✅ Garantía. 🎁 BONOS GRATIS por comprar HOY (con su valor). 💰 Valor real total: X. 🔥 HOY pagás solo: Y (95% off)."
Todo en ${idy.idioma}.`;
  const user = `Producto: ${idy.product}
País: ${idy.pais}  ·  Precio HOY: ${idy.precio} ${idy.moneda}  ·  Método de pago: ${idy.metodo_pago}
${b.description ? 'Descripción / qué incluye: ' + b.description : ''}
${idy.style ? 'Estilo y colores que pide el dueño (RESPÉTALOS al elegir la paleta): ' + idy.style : ''}

Arma el brief de la campaña. Devuelve SOLO un JSON (sin texto extra) con esta forma exacta:
{"hook_principal":"frase gancho corta y potente","descripcion":"1 frase","contenido":["item incluido 1","item 2","..."],"beneficios":["beneficio corto 1","..."],"bonos":[{"nombre":"Bono 1","valor":"valor en ${idy.moneda}"}],"publico":"a quién le sirve","cta":"${idy.cta}","color_principal":"color según el nicho","color_secundario":"color","paleta":"3-4 colores exactos separados por coma que definen la campaña","precio_anterior":"valor tachado o null si no aplica","testimonios":[{"texto":"...","nombre":"Nombre local","ciudad":"ciudad de ${idy.pais}"}],"faq":[{"q":"pregunta","a":"respuesta corta"}]}
Reglas: contenido y beneficios REALISTAS para ESTE producto (no genéricos). 3 testimonios, 4 FAQ.
PALETA por nicho (elige la que MEJOR represente el producto, comprométete con ella):
- Automotriz/mecánica: negro + rojo + plata (taller, metal).
- Camiones/maquinaria: negro + amarillo industrial + acero.
- Salud/farmacia/medicina/enfermería: azul clínico + blanco + verde/turquesa (limpio, confiable, profesional médico; NADA de rojo taller).
- Café/gastronomía: negro + marrón + dorado.
- Finanzas/negocios: azul marino + dorado + blanco.
- Belleza/estética: rosa/nude + dorado + blanco.
Si el dueño indicó estilo/colores, PRIORÍZALOS. Todo en ${idy.idioma}.`;
  const out = await callClaudeConversation(sys, [{ role: 'user', content: user }], 4000);
  if (out.error === 'nokey') return res.status(400).json({ error: 'Conecta tu API Key de Claude en Inteligencia IA.' });
  if (out.error) return res.status(400).json({ error: out.error });
  const brief = extractJson(out.text);
  if (!brief || typeof brief !== 'object') return res.status(400).json({ error: 'La IA no devolvió un brief válido, reintenta.' });
  res.json({ identity: idy, brief, pieces: AD_PIECES.map(p => ({ key: p.key, label: p.label })), has_openai: !!(await getSetting('openai_key')) });
}));

// SERIE DE ANUNCIOS · paso 2: genera UNA pieza (imagen) del set. El front las llama una por una.
app.post('/api/lab/adseries/piece', auth(async (req, res) => {
  const b = req.body || {};
  const idy = b.identity || {};
  const brief = b.brief || {};
  const piece = AD_PIECES.find(p => p.key === b.piece);
  if (!piece || !idy.product) return res.status(400).json({ error: 'Datos de pieza incompletos' });
  if (!(await getSetting('openai_key'))) return res.status(400).json({ error: 'Pega tu llave de imágenes (OpenAI) en Inteligencia IA para generar la serie.' });
  const prompt = buildAdPrompt(idy, brief, piece);
  const quality = (b.quality === 'high' || b.quality === 'low') ? b.quality : 'medium';
  const img = await generateImage(prompt, '1024x1024', quality);
  if (img.error) return res.status(400).json({ error: img.error });
  const base = (await getSetting('public_url')) || (req.protocol + '://' + req.get('host'));
  let mediaId = null, imageUrl = img.url || null;
  if (img.b64) {
    const tok = crypto.randomBytes(12).toString('hex');
    const size = Math.round(img.b64.length * 3 / 4);
    const m = await one('INSERT INTO media (workspace_id,name,mime,category,data,size,token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.workspace.id, 'ad-' + piece.key + '-' + String(idy.product).slice(0, 24), 'image/png', 'creativo', img.b64, size, tok]);
    mediaId = m.id; imageUrl = base + '/api/media/file/' + m.id + '?t=' + tok;
  }
  const row = await one(
    `INSERT INTO lab_creatives (account_id,idea_id,workspace_id,country_code,product,angle,headline,primary_text,visual_prompt,media_id,image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.accountId, b.idea_id || null, req.workspace.id, idy.cc || null, idy.product, piece.label,
     piece.label, String(brief.hook_principal || '').slice(0, 400), prompt.slice(0, 4000), mediaId, imageUrl]);
  if (b.idea_id) await q("UPDATE lab_ideas SET status='creativos' WHERE id=$1 AND account_id=$2 AND status='idea'", [b.idea_id, req.accountId]);
  res.json({ creative: row });
}));

// 3) AUTO-FLUJO: la IA arma el flujo completo de WhatsApp para un producto y lo crea en la marca destino.
app.post('/api/lab/genflow', auth(async (req, res) => {
  const b = req.body || {};
  const ws = req.workspace; // marca/país destino = workspace actual
  const product = String(b.product || '').slice(0, 160);
  if (!product) return res.status(400).json({ error: 'Falta el producto' });
  const price = Math.max(0, Math.round(Number(b.price) || 0));
  const angle = String(b.angle || '').slice(0, 300);
  const cc = ws.country_code || '';
  const lang = ws.agent_lang || (cc === 'BR' ? 'pt' : 'es');
  const agentName = ws.agent_name || 'Sofía';
  const tone = ws.agent_tone || 'cercano, amable y persuasivo, estilo WhatsApp';
  const metodo = (await (async () => { const pm = await one('SELECT label,detail FROM payment_methods WHERE workspace_id=$1 ORDER BY id LIMIT 1', [ws.id]); return pm ? (pm.label || pm.detail) : (PAY_BY_CC[cc] || 'transferencia'); })());
  const moneda = ws.currency || CUR_BY_CC[cc] || '';
  const sys = `Eres experto en diseñar flujos de venta por WhatsApp para PDFmania (infoproductos PDF low-ticket). Diseñas la secuencia de apertura que recibe a un lead que llega desde un anuncio de Meta y lo lleva a la compra, al estilo REAL de la marca. Escribes en ${labLang(cc)}, cálido, cercano y local, con emojis con moderación. SOLO puedes usar estos tipos de paso:
- {"type":"message","text":"..."}  -> mensaje que envía el bot
- {"type":"wait","seconds":N}       -> espera N segundos (máx 60) para que se sienta humano
- {"type":"ai","prompt":"..."}      -> el asesor IA responde libre siguiendo esta instrucción

ESTILO DE REFERENCIA (imítalo en estructura, adáptalo al producto):
Msg1 (intro cálida y local): "¡Buenas! Soy ${agentName} del equipo PDFmania ${COUNTRY_NAMES[cc] || cc}. Te mando rapidito todo del ${product} para que decidás con calma, sin presión. Mirá lo que vas a recibir 👇"
Msg2 (la OFERTA completa): nombre del producto en mayúsculas, lista de lo que incluye con ✅, 🎁 bonos gratis por comprar HOY (cada uno con su valor), 💰 valor real total, 🔥 precio de HOY con % de descuento. Con anclaje de valor.
Msg3 (cierre): recap del precio de HOY y CTA claro: "Si querés que te pase los datos de pago para empezar HOY, respondé SÍ o QUIERO ACCESO".`;
  const user = `Producto a vender: ${product}${price ? ' — precio HOY ' + price + ' ' + moneda : ''}
País: ${COUNTRY_NAMES[cc] || cc}  ·  Método de pago: ${metodo}
Vendedor(a): ${agentName}, tono ${tone}
${angle ? 'Ángulo del anuncio por el que llegó el lead: ' + angle : ''}

Diseña la secuencia de APERTURA imitando el estilo de referencia, adaptada a ESTE producto, país e idioma. Inventa beneficios y bonos REALISTAS y coherentes con el producto (no exageres cifras médicas ni financieras). Incluye esperas MUY cortas entre mensajes: 2 o 3 segundos máximo (nunca más de 3).
Devuelve SOLO un JSON array de 4 a 6 pasos (sin texto extra), usando únicamente los tipos permitidos. Orden sugerido: message (intro) → wait → message (oferta con ✅ y 🎁 bonos y precio 🔥) → wait → message (CTA "respondé SÍ/QUIERO") → ai (asesor que, cuando el cliente responde, le da los datos de pago con ${metodo} y cierra la venta de ESTE producto). El primer paso debe ser el "message" de intro.`;
  const out = await callClaudeConversation(sys, [{ role: 'user', content: user }], 3000);
  if (out.error === 'nokey') return res.status(400).json({ error: 'Conecta tu API Key de Claude en Inteligencia IA.' });
  if (out.error) return res.status(400).json({ error: out.error });
  let steps = extractJson(out.text);
  if (!Array.isArray(steps) || !steps.length) return res.status(400).json({ error: 'La IA no devolvió un flujo válido, reintenta.' });
  // Sanitiza: solo tipos permitidos. Esperas cortas (máx 3s) para que no se sienta lento.
  steps = steps.map(s => {
    if (!s || !s.type) return null;
    if (s.type === 'message') return s.text ? { type: 'message', text: String(s.text).slice(0, 900) } : null;
    if (s.type === 'wait') return { type: 'wait', seconds: Math.max(1, Math.min(3, Number(s.seconds) || 2)) };
    if (s.type === 'ai') return s.prompt ? { type: 'ai', prompt: String(s.prompt).slice(0, 1200) } : null;
    return null;
  }).filter(Boolean);
  if (!steps.length) return res.status(400).json({ error: 'El flujo generado quedó vacío, reintenta.' });
  // Inserta las imágenes generadas del producto (Hero tras la intro; Oferta antes del CTA).
  try {
    const imgs = await many(
      `SELECT angle, image_url FROM lab_creatives WHERE account_id=$1 AND workspace_id=$2 AND image_url IS NOT NULL AND lower(product)=lower($3) ORDER BY id DESC`,
      [req.accountId, ws.id, product]);
    const pick = re => (imgs.find(x => re.test(String(x.angle || ''))) || {}).image_url || null;
    const hero = pick(/hero|portada/i) || (imgs[0] && imgs[0].image_url) || null;
    const oferta = pick(/oferta/i);
    const incluye = pick(/incluye/i);
    if (hero) {
      const firstMsg = steps.findIndex(s => s.type === 'message');
      steps.splice(firstMsg + 1, 0, { type: 'image', url: hero, filename: 'anuncio.png', caption: '' });
    }
    if (incluye) {
      // tras la primera imagen/intro, refuerza con la de "todo lo que incluye"
      const at = steps.findIndex(s => s.type === 'image');
      if (at >= 0) steps.splice(at + 1, 0, { type: 'image', url: incluye, filename: 'incluye.png', caption: '' });
    }
    if (oferta) {
      // antes del último mensaje (CTA)
      let lastMsg = -1; steps.forEach((s, i) => { if (s.type === 'message') lastMsg = i; });
      if (lastMsg > 0) steps.splice(lastMsg, 0, { type: 'image', url: oferta, filename: 'oferta.png', caption: '' });
    }
  } catch (e) { /* si no hay imágenes, el flujo va sin ellas */ }
  // Asegura el producto en la marca (crea si no existe), con precio y link de entrega si vienen.
  const deliveryUrl = String(b.delivery_url || '').trim() || null;
  let productId = null;
  const existing = await one('SELECT id FROM products WHERE workspace_id=$1 AND lower(name)=lower($2)', [ws.id, product]);
  if (existing) {
    productId = existing.id;
    if (price) await q('UPDATE products SET price=$1 WHERE id=$2', [price, productId]);
    if (deliveryUrl) await q('UPDATE products SET delivery_url=$1 WHERE id=$2', [deliveryUrl, productId]);
  } else {
    const p = await one('INSERT INTO products (workspace_id,name,price,delivery_url) VALUES ($1,$2,$3,$4) RETURNING id', [ws.id, product, price, deliveryUrl]);
    productId = p.id;
  }
  // Upsert del flujo por nombre: si ya existe "Testeo · <producto>", lo ACTUALIZA (no duplica).
  const kws = ['hola', normText(product).split(/\s+/).filter(w => w.length >= 4)[0]].filter(Boolean).join(', ');
  const flowName = 'Testeo · ' + product;
  const prev = await one('SELECT id, active FROM flows WHERE workspace_id=$1 AND name=$2 ORDER BY id LIMIT 1', [ws.id, flowName]);
  let flowId;
  if (prev) {
    await q('UPDATE flows SET trigger_type=$1, trigger_value=$2, steps=$3, product_id=$4 WHERE id=$5',
      ['first_message', kws, JSON.stringify(steps), productId, prev.id]);
    flowId = prev.id;
  } else {
    const f = await one('INSERT INTO flows (workspace_id,name,trigger_type,trigger_value,steps,active,product_id) VALUES ($1,$2,$3,$4,$5,false,$6) RETURNING id',
      [ws.id, flowName, 'first_message', kws, JSON.stringify(steps), productId]);
    flowId = f.id;
  }
  if (b.idea_id) await q("UPDATE lab_ideas SET status='flujo' WHERE id=$1 AND account_id=$2", [b.idea_id, req.accountId]);
  res.json({ flow_id: flowId, product_id: productId, steps, name: flowName, updated: !!prev });
}));

// Arma el "cerebro" del vendedor IA con el catálogo y datos de pago de la marca actual
async function buildSalesSystem(ws, focusProduct) {
  const prods = await many('SELECT name,price,delivery_url,description FROM products WHERE workspace_id=$1', [ws.id]);
  const cur = ws.currency || '';
  const catalog = prods.length
    ? prods.map(p => `- ${p.name}: ${Number(p.price).toLocaleString('es-CO')} ${cur}${p.description ? '\n   (Qué incluye: ' + p.description + ')' : ''}`).join('\n')
    : '(aún no hay productos cargados; si preguntan, di que en un momento les compartes el catálogo)';
  // FOCO: si el cliente llegó por un anuncio de un producto específico, se cierra ESE (no se tira todo el catálogo).
  const foco = focusProduct
    ? `\n\n⭐ FOCO DE ESTA CONVERSACIÓN: el cliente llegó interesado en "${focusProduct.name}" (${Number(focusProduct.price).toLocaleString('es-CO')} ${cur}).${focusProduct.description ? ' Qué incluye: ' + focusProduct.description + '.' : ''} Enfócate en cerrar ESE producto. Solo ofrece otro si el cliente lo pide expresamente. No abrumes con el catálogo completo.`
    : '';
  // Agente por país (marca). Si la marca no lo tiene, usa valores por defecto.
  const name = ws.agent_name || 'Sofía';
  const tone = ws.agent_tone || 'cercano, amable y persuasivo, estilo WhatsApp';
  const extra = ws.agent_instructions || '';
  // Idioma por país: Brasil -> portugués; el resto -> español. Se puede forzar con agent_lang.
  const lang = ws.agent_lang || (ws.country_code === 'BR' ? 'pt' : 'es');
  const methods = await many('SELECT label,type,detail FROM payment_methods WHERE workspace_id=$1', [ws.id]);

  if (lang === 'pt') {
    let pago;
    if (methods.length) {
      const lines = methods.map(m => {
        const t = m.type === 'link' ? '(link de pagamento)' : m.type === 'nequi' ? '(Nequi)' : '(transferência)';
        return `- ${m.label || m.type} ${t}: ${m.detail}`;
      }).join('\n');
      pago = `Quando o cliente quiser comprar, ofereça estas formas de pagamento para ele escolher:\n${lines}\nSe for link, peça que pague ali; se for transferência, passe os dados. Depois peça a FOTO do comprovante para confirmar e entregar o produto na hora.`;
    } else if (ws.beneficiary_name) {
      pago = `Quando o cliente quiser comprar, passe os dados de pagamento: transferir para "${ws.beneficiary_name}"${ws.beneficiary_account ? ' — ' + ws.beneficiary_account : ''}. Depois peça a FOTO do comprovante para confirmar e entregar o produto na hora.`;
    } else {
      pago = `Se perguntarem como pagar, diga que já vai passar os dados (ainda não estão configurados no sistema).`;
    }
    return `Você é ${name}, a vendedora estrela da PDFmania ${ws.name || ''} 🛍️. Você vende produtos digitais (guias, modelos e cursos em PDF) pelo WhatsApp para clientes do Brasil.

SUA PERSONALIDADE: ${tone}. Você escreve como uma pessoa real no WhatsApp: mensagens curtas (1 a 3 frases), naturais, com algum emoji com moderação. Nunca soa como robô nem como um formulário.

SUA MISSÃO: vender. Você é persuasiva mas honesta. Gera confiança, tira dúvidas, quebra objeções (preço, "vou pensar", desconfiança) e leva o cliente ao fechamento sem ser chata. Cria urgência sutil (bônus, vagas, preço de hoje) só quando ajuda.

CATÁLOGO E PREÇOS (moeda ${cur}) — use SOMENTE estes, não invente produtos nem preços:
${catalog}${foco}

COMO FECHAR: quando notar QUALQUER interesse, NÃO espere: diga o preço com segurança e já passe os dados de pagamento (assuma a venda, não pergunte "quer comprar?"). Mensagens curtas. ${pago}

REGRAS:
- Responda SEMPRE em português (português do Brasil), caloroso e direto.
- Não prometa coisas que não estão no catálogo.
- Se o cliente disser que já pagou ou mandar um comprovante, agradeça e diga que está verificando para entregar o produto.
- Mantenha o foco em avançar a venda.
${extra ? '\nINSTRUÇÕES EXTRAS DO DONO:\n' + extra : ''}`;
  }

  // Español (por defecto)
  let pago;
  if (methods.length) {
    const lines = methods.map(m => {
      const t = m.type === 'link' ? '(link de pago)' : m.type === 'nequi' ? '(Nequi)' : '(transferencia)';
      return `- ${m.label || m.type} ${t}: ${m.detail}`;
    }).join('\n');
    pago = `Cuando el cliente quiera comprar, ofrécele estos métodos de pago y que elija el que prefiera:\n${lines}\nSi es link, dile que pague ahí; si es transferencia, dale la cuenta. Luego pídele que te envíe la FOTO del comprobante o captura del pago para confirmar y entregarle su producto al instante.`;
  } else if (ws.beneficiary_name) {
    pago = `Cuando el cliente quiera comprar, dale los datos de pago: transferir a "${ws.beneficiary_name}"${ws.beneficiary_account ? ' — ' + ws.beneficiary_account : ''}. Luego pídele que te envíe la FOTO del comprobante para confirmar y entregarle su producto al instante.`;
  } else {
    pago = `Si preguntan cómo pagar, di que enseguida les pasas los datos (aún no están configurados en el sistema).`;
  }
  return `Eres ${name}, la vendedora estrella de PDFmania ${ws.name || ''} 🛍️. Vendes productos digitales (guías, manuales y cursos en PDF) por WhatsApp a clientes de LATAM. Cierras ventas de verdad.

TU PERSONALIDAD: ${tone}. Escribes EXACTAMENTE como una persona real por WhatsApp: mensajes MUY cortos (1-2 frases), naturales, cálidos, con algún emoji con moderación. Nunca suenas a robot, a call center ni a formulario. Nada de textos largos ni listas eternas.

TU MISIÓN: CERRAR LA VENTA hoy. Eres persuasiva pero honesta. Guías al cliente paso a paso hasta el pago, sin marear.

CÓMO VENDES (técnicas de closer):
1. Responde SIEMPRE lo que el cliente preguntó, con seguridad y en 1-2 frases. No lo ignores para saltar a vender.
2. Haz UNA sola pregunta a la vez que avance hacia la compra (no interrogues).
3. Cuando muestre el más mínimo interés, NO esperes: dile el precio con seguridad y pásale de una los datos de pago. No preguntes "¿te gustaría comprar?" — asume la venta ("Te paso los datos y en 2 min lo tienes 👇").
4. Rompe objeciones con calma y sin discutir:
   - "está caro" → valor/beneficio + precio de hoy + bono.
   - "lo pienso" → pregunta qué duda tiene y resuélvela; crea urgencia suave (precio/bono de hoy).
   - "desconfío" → garantía, entrega inmediata, que muchos ya lo tienen.
5. Crea urgencia REAL pero sutil (precio de hoy, bono por comprar ya). Nunca mientas.
6. Cierra pidiendo la acción concreta: que haga el pago y mande la foto del comprobante.
7. COBERTURA: si el cliente pregunta si incluye una MARCA, MODELO, VEHÍCULO o TEMA (aunque escriba con errores, ej. "chary"=Chery, "aveo", "arauca", "spark"), responde con TOTAL seguridad que SÍ está incluido — el pack cubre miles de marcas y modelos. Es una señal de compra: aprovéchala y ve al cierre ("Sí, lo tenemos 🚗 ¿te paso los datos y lo activas hoy?"). PROHIBIDO decir "no entendí" ante una marca/modelo.
8. NO vuelvas a saludar ("Hola") si la conversación ya empezó. Continúa directo donde iba.
9. Interpreta con buena voluntad los mensajes cortos o con faltas de ortografía (los clientes escriben rápido). No pidas que repitan salvo que sea imposible entender.

CATÁLOGO Y PRECIOS (moneda ${cur}) — usa SOLO estos, no inventes productos ni precios:
${catalog}${foco}

DATOS DE PAGO: ${pago}

REGLAS DURAS:
- Español, cálido y directo. Mensajes cortos SIEMPRE.
- Nunca inventes precios, productos, links ni promesas fuera del catálogo.
- Si el cliente dice que ya pagó o manda comprobante: agradece y dile que lo estás verificando para entregarle YA su producto (no le pidas que pague otra vez).
- No repitas el saludo si ya saludaste. Sigue la conversación donde iba.
- Objetivo de cada mensaje: acercar el cierre. Si ya hay interés, ve directo al pago.
${extra ? '\nINSTRUCCIONES EXTRA DEL DUEÑO (respétalas):\n' + extra : ''}`;
}

// Llamada de conversación (multi-turno) a Claude
async function callClaudeConversation(system, messages, maxTokens) {
  const key = await getSetting('anthropic_key');
  if (!key) return { error: 'nokey' };
  const model = (await getSetting('anthropic_model')) || 'claude-sonnet-5';
  const mt = maxTokens || 1024;
  let lastErr = 'La IA no respondió';
  for (let attempt = 0; attempt < 2; attempt++) {
    let d;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: mt, system, messages }),
      });
      d = await r.json();
      if (!r.ok) {
        lastErr = (d.error && d.error.message) || ('Error de IA (' + r.status + ')');
        if ((r.status === 429 || r.status === 500 || r.status === 529) && attempt === 0) continue; // sobrecarga -> reintenta
        return { error: lastErr };
      }
    } catch (e) { lastErr = 'No pude conectar con la IA'; if (attempt === 0) continue; return { error: lastErr }; }
    // Junta TODO el texto (no solo el primer bloque)
    const text = (d.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
    if (text) return { text };
    if (attempt === 0) continue; // vino vacío -> reintenta una vez
    return { error: 'La IA devolvió una respuesta vacía (posible sobrecarga momentánea). Reintenta.' + (d.stop_reason ? ' [' + d.stop_reason + ']' : '') };
  }
  return { error: lastErr };
}

// Respuesta con OpenAI (GPT) — mismo formato de mensajes {role,content}; system va como primer mensaje.
async function openaiChat(system, messages, maxTokens) {
  const key = await getSetting('openai_key');
  if (!key) return { error: 'nokey' };
  const model = (await getSetting('openai_chat_model')) || 'gpt-4o';
  const oaMsgs = [{ role: 'system', content: system }].concat(messages.map(m => ({ role: m.role, content: m.content })));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: oaMsgs, max_tokens: maxTokens || 600 }),
      });
      const d = await r.json();
      if (!r.ok) {
        const em = (d.error && d.error.message) || ('Error OpenAI (' + r.status + ')');
        if ((r.status === 429 || r.status >= 500) && attempt === 0) continue;
        return { error: em };
      }
      const text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (text && text.trim()) return { text: text.trim() };
      if (attempt === 0) continue;
      return { error: 'OpenAI devolvió una respuesta vacía.' };
    } catch (e) { if (attempt === 0) continue; return { error: 'No pude conectar con OpenAI' }; }
  }
  return { error: 'OpenAI no respondió' };
}
// Enruta la CONVERSACIÓN DE VENTA al cerebro elegido (Claude u OpenAI). El resto sigue en Claude.
async function chatComplete(system, messages, maxTokens) {
  const provider = (await getSetting('ai_provider')) || 'anthropic';
  if (provider === 'openai') {
    const out = await openaiChat(system, messages, maxTokens);
    // Si OpenAI no está configurado, cae a Claude para no dejar al cliente sin respuesta.
    if (out.error === 'nokey') return await callClaudeConversation(system, messages, maxTokens);
    return out;
  }
  return await callClaudeConversation(system, messages, maxTokens);
}

// Probar el agente vendedor (chat de prueba)
app.post('/api/agent/chat', auth(async (req, res) => {
  const ws = req.workspace;
  let messages = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  messages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));
  if (!messages.length) return res.status(400).json({ error: 'Escribe un mensaje' });
  if (messages[0].role !== 'user') messages = messages.slice(messages.findIndex(m => m.role === 'user'));
  const system = await buildSalesSystem(ws);
  const out = await chatComplete(system, messages);
  if (out.error === 'nokey') return res.status(400).json({ error: 'Conecta tu API Key (Claude u OpenAI) arriba para probar al agente.' });
  if (out.error) return res.status(400).json({ error: out.error });
  res.json({ reply: out.text });
}));

// ---------- Config de pagos (beneficiario por marca) ----------
app.get('/api/pagosconfig/payment-config', auth(async (req, res) => {
  res.json({ beneficiary_name: req.workspace.beneficiary_name || '', beneficiary_account: req.workspace.beneficiary_account || '' });
}));
app.post('/api/pagosconfig/payment-config', auth(async (req, res) => {
  const { beneficiary_name, beneficiary_account } = req.body || {};
  await q('UPDATE workspaces SET beneficiary_name=$1, beneficiary_account=$2 WHERE id=$3', [beneficiary_name || null, beneficiary_account || null, req.workspace.id]);
  res.json({ ok: true });
}));

// Métodos de pago (varios: cuenta bancaria, Mercado Pago link, etc.)
app.get('/api/pagosconfig/methods', auth(async (req, res) => {
  const list = await many('SELECT id,label,type,detail FROM payment_methods WHERE workspace_id=$1 ORDER BY id', [req.workspace.id]);
  res.json({ methods: list });
}));
app.post('/api/pagosconfig/methods', auth(async (req, res) => {
  const { id, label, type, detail } = req.body || {};
  if (!detail || !String(detail).trim()) return res.status(400).json({ error: 'Falta el dato (cuenta o link)' });
  if (id) {
    await q('UPDATE payment_methods SET label=$1,type=$2,detail=$3 WHERE id=$4 AND workspace_id=$5',
      [label || '', type || 'cuenta', String(detail).trim(), id, req.workspace.id]);
    return res.json({ id });
  }
  const m = await one('INSERT INTO payment_methods (workspace_id,label,type,detail) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.workspace.id, label || '', type || 'cuenta', String(detail).trim()]);
  res.json({ id: m.id });
}));
app.post('/api/pagosconfig/methods/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM payment_methods WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  res.json({ ok: true });
}));

// ---------- Productos (Media / entrega) ----------
app.post('/api/dashboard/product', auth(async (req, res) => {
  const { id, name, price, delivery_url } = req.body || {};
  const desc = req.body && req.body.description != null ? String(req.body.description).slice(0, 1500) : undefined;
  if (id) {
    await q('UPDATE products SET name=$1, price=$2, delivery_url=$3, description=COALESCE($4,description) WHERE id=$5 AND workspace_id=$6',
      [name, Math.round(price || 0), delivery_url || null, desc !== undefined ? desc : null, id, req.workspace.id]);
    return res.json({ id });
  }
  const p = await one('INSERT INTO products (workspace_id,name,price,delivery_url,description) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [req.workspace.id, name || 'Producto', Math.round(price || 0), delivery_url || null, desc || null]);
  res.json({ id: p.id });
}));

// ---------- Biblioteca de archivos (media) ----------
app.post('/api/media/upload', auth(async (req, res) => {
  const { name, mime, category, data_base64 } = req.body || {};
  if (!data_base64) return res.status(400).json({ error: 'Falta el archivo' });
  const b64 = data_base64.replace(/^data:[^;]+;base64,/, '');
  const mt = mime || (data_base64.match(/^data:([^;]+);/) || [])[1] || 'application/octet-stream';
  const size = Math.round(b64.length * 3 / 4);
  if (size > 15 * 1024 * 1024) return res.status(413).json({ error: 'Archivo muy grande (máx 15MB)' });
  const tok = crypto.randomBytes(12).toString('hex');
  const m = await one('INSERT INTO media (workspace_id,name,mime,category,data,size,token) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [req.workspace.id, name || 'archivo', mt, category || 'general', b64, size, tok]);
  const base = (await getSetting('public_url')) || (req.protocol + '://' + req.get('host'));
  res.json({ id: m.id, url: base + '/api/media/file/' + m.id + '?t=' + tok, mime: mt, name: name || 'archivo' });
}));

app.get('/api/media', auth(async (req, res) => {
  const cat = req.query.category;
  const rows = cat
    ? await many('SELECT id,name,mime,category,size,created_at FROM media WHERE workspace_id=$1 AND category=$2 ORDER BY id DESC', [req.workspace.id, cat])
    : await many('SELECT id,name,mime,category,size,created_at FROM media WHERE workspace_id=$1 ORDER BY id DESC', [req.workspace.id]);
  res.json({ media: rows });
}));

// Archivo por link. Si tiene token, exige ?t= correcto (protege comprobantes de clientes).
app.get('/api/media/file/:id', h(async (req, res) => {
  const m = await one('SELECT mime,data,name,token FROM media WHERE id=$1', [req.params.id]);
  if (!m) return res.sendStatus(404);
  if (m.token && String(req.query.t || '') !== m.token) return res.sendStatus(403);
  const buf = Buffer.from(m.data, 'base64');
  res.set('Content-Type', m.mime || 'application/octet-stream');
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(buf);
}));

app.post('/api/media/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM media WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  res.json({ ok: true });
}));

// ---------- Motor de comprobantes de pago ----------
async function callClaudeVision(base64, mediaType) {
  const key = await getSetting('anthropic_key');
  if (!key) return null;
  const model = (await getSetting('anthropic_model')) || 'claude-sonnet-5';
  const prompt = `Eres un verificador de comprobantes de pago (transferencias bancarias en LATAM: Nequi, Bancolombia, Mercado Pago, SPEI, etc.).
Analiza el comprobante (imagen o PDF) y responde SOLO con un JSON válido (sin texto extra) con esta forma exacta:
{"is_receipt":true/false,"amount":numero_o_null,"currency":"MXN"|"COP"|"ARS"|null,"beneficiary":"nombre_de_quien_RECIBE_o_null","account":"cuenta_CLABE_o_tarjeta_de_quien_recibe_o_null","sender":"quien_envia_o_null","reference":"num_referencia_o_null","bank":"banco_o_null","date":"fecha_o_null","tampering":true/false,"notes":"observaciones"}
Reglas:
- amount = SOLO el número del monto pagado (sin símbolos ni comas, usa punto decimal). Es el monto TRANSFERIDO/ENVIADO, no saldos ni comisiones.
- beneficiary = nombre completo de quien RECIBE el dinero (destinatario). NO pongas al que envía.
- account = número de cuenta, CLABE o tarjeta del DESTINATARIO si aparece.
- sender = nombre de quien ENVÍA (ordenante), si aparece.
- reference = folio / número de operación / clave de rastreo.
- tampering=true solo si hay señales claras de edición (fuentes inconsistentes, montos pegados, bordes raros).
Sé literal: transcribe los nombres exactamente como se ven, con acentos.`;
  // Imagen -> bloque image; PDF -> bloque document (Claude lee PDFs de forma nativa)
  const isPdf = /pdf/i.test(mediaType || '');
  const mediaBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: [
      mediaBlock,
      { type: 'text', text: prompt },
    ] }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || 'Error de IA');
  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// La IA lee la conversación y decide QUÉ producto está comprando el cliente (cuando hay varios al mismo precio).
async function pickProductFromConversation(candidates, convText) {
  try {
    if (!convText || !candidates || candidates.length < 2) return null;
    const key = await getSetting('anthropic_key');
    if (!key) return null;
    const list = candidates.map((p, i) => (i + 1) + '. ' + p.name).join('\n');
    const sys = 'Eres un clasificador de intención de compra. Te doy una conversación de ventas por WhatsApp y una lista de productos. Debes deducir QUÉ producto está comprando el cliente según lo que pidió. Ejemplos: si el cliente habló de "motos/motocicletas" es el producto de motos; si habló de "mecánica/autos/carros/coches/vehículos/automotriz" es el automotriz. Responde ÚNICAMENTE con el número del producto (ej. "1"). Si de plano no hay ninguna pista, responde "0".';
    const user = 'Productos:\n' + list + '\n\nConversación (lo más reciente primero):\n' + String(convText).slice(0, 2500) + '\n\n¿Qué número de producto está comprando el cliente? Responde solo el número.';
    const ans = await claudeReply(sys, user);
    const mm = ans && String(ans).match(/\d+/);
    if (!mm) return null;
    const idx = parseInt(mm[0], 10) - 1;
    return candidates[idx] || null;
  } catch (e) { console.error('[pickProduct]', e.message); return null; }
}

async function verifyReceipt(ws, extracted, convText, convProductId) {
  const convNorm = normText(convText || '');
  // Filosofía FLEXIBLE: la señal principal de un pago real es que el MONTO coincida con un producto.
  // El beneficiario y las señales de edición son solo AVISOS (no bloquean la entrega).
  // Solo se bloquea (revisión humana) si: no es comprobante, es duplicado, o el monto no cuadra con ningún producto.
  const notes = [];       // avisos suaves (no bloquean)
  const blockers = [];    // razones que SÍ bloquean

  if (!extracted || !extracted.is_receipt) {
    return { status: 'rechazado', reason: 'No parece un comprobante de pago', matchedProduct: null, extracted };
  }

  // (Se quitó el bloqueo por "referencia duplicada": daba falsos positivos. La verificación
  //  ahora es flexible — se basa en el MONTO, y el beneficiario es solo un aviso suave.)

  // Beneficiario -> SOLO aviso, nunca bloquea. Y flexible: si NO viene el beneficiario
  // (muy común en Mercado Pago), no se avisa nada — se entrega por monto sin ruido.
  const methods = await many("SELECT label,type,detail FROM payment_methods WHERE workspace_id=$1 AND type<>'link'", [ws.id]);
  const bankTargets = [];
  if (ws.beneficiary_name) bankTargets.push(ws.beneficiary_name);
  if (ws.beneficiary_account) bankTargets.push(ws.beneficiary_account);
  methods.forEach(m => { if (m.label) bankTargets.push(m.label); if (m.detail) bankTargets.push(m.detail); });
  const STOP = new Set(['servicios', 'servicio', 'sa', 'sas', 'de', 'cv', 'sc', 'srl', 'ltda', 'banco', 'cuenta', 'pago', 'pagos', 'mercado', 'mp', 'the', 'del', 'los', 'las', 'and', 'llc', 'inc', 'co']);
  const isMP = /mercado\s*pago|mercadopago|\bmp\b/i.test([extracted.bank, extracted.beneficiary, extracted.notes].filter(Boolean).join(' '));
  const benefNorm = normText(extracted.beneficiary || '');
  const benefWords = new Set(benefNorm.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)));
  // Solo evaluamos coincidencia si viene un NOMBRE de beneficiario y NO es Mercado Pago.
  if (bankTargets.length && benefWords.size && !isMP) {
    const ok = bankTargets.some(t => {
      const tn = normText(t);
      const tWords = tn.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
      return tWords.some(w => benefWords.has(w) || (w.length >= 4 && benefNorm.includes(w)));
    });
    if (!ok) notes.push('El beneficiario no coincide claramente con tus cuentas (se entregó por monto)');
  }

  // Señales de edición -> solo aviso
  if (extracted.tampering) notes.push('Posibles señales de edición (revisar)');

  // Ayuda a elegir el producto correcto cuando hay varios: el que se mencionó en la conversación.
  const mentionedInConv = (p) => {
    if (!convNorm) return false;
    const words = normText(p.name).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
    return words.some(w => convNorm.includes(w));
  };

  // Monto -> producto (FLEXIBLE)
  const prods = await many('SELECT * FROM products WHERE workspace_id=$1 ORDER BY price DESC', [ws.id]);
  let matchedProduct = null;
  const amt = extracted.amount != null ? Number(String(extracted.amount).replace(/[^0-9.]/g, '')) : null;

  // PRIORIDAD MÁXIMA: si el flujo ya asignó un producto a esta conversación, ese se entrega.
  if (convProductId) {
    const tagged = prods.find(p => p.id === convProductId);
    if (tagged) {
      matchedProduct = tagged;
      notes.push('Producto definido por el flujo: ' + tagged.name);
    }
  }

  if (!matchedProduct && amt != null && !isNaN(amt) && prods.length) {
    // Todos los productos cuyo precio cuadra con el monto (±5% o hasta 2 unidades)
    const priceMatches = prods.filter(p => { const pr = Number(p.price); return Math.abs(pr - amt) <= 2 || (pr > 0 && Math.abs(pr - amt) / pr <= 0.05); });
    if (priceMatches.length === 1) {
      matchedProduct = priceMatches[0];
    } else if (priceMatches.length > 1) {
      // DESEMPATE (varios productos al mismo precio): 1) palabra del nombre en el chat, 2) la IA decide según la conversación
      let pick = priceMatches.find(mentionedInConv);
      if (!pick) pick = await pickProductFromConversation(priceMatches, convText);
      matchedProduct = pick || priceMatches[0];
      if (!pick) notes.push('Varios productos a ese precio; se entregó "' + matchedProduct.name + '" (revisa si el cliente quería otro)');
    }
    // 2) producto más cercano dentro del 15% (prefiere el mencionado / el que dice la IA)
    if (!matchedProduct) {
      const near = prods.filter(p => { const pr = Number(p.price); return pr > 0 && Math.abs(pr - amt) / pr <= 0.15; });
      if (near.length) {
        matchedProduct = near.find(mentionedInConv) || (near.length > 1 ? await pickProductFromConversation(near, convText) : null) || near.sort((a, b) => Math.abs(a.price - amt) - Math.abs(b.price - amt))[0];
        notes.push('Monto ' + amt + ' aprox. al producto ' + matchedProduct.name);
      }
    }
    // 3) si solo hay un producto y pagó al menos el 80%, entrega
    if (!matchedProduct && prods.length === 1) {
      const pr = Number(prods[0].price);
      if (pr > 0 && amt >= pr * 0.8) matchedProduct = prods[0];
    }
  } else if ((amt == null || isNaN(amt)) && prods.length === 1) {
    // No se leyó el monto pero hay un solo producto -> entrega igual
    matchedProduct = prods[0];
    notes.push('No se leyó el monto con claridad; se entregó el único producto');
  }

  // Decisión final
  if (blockers.length) {
    return { status: 'sospechoso', reason: blockers.concat(notes).join('; '), matchedProduct, extracted };
  }
  if (matchedProduct) {
    return { status: 'valido', reason: notes.join('; ') || 'Pago verificado por monto', matchedProduct, extracted };
  }
  const why = (amt != null && !isNaN(amt)) ? ('El monto (' + amt + ') no coincide con ningún producto') : 'No se pudo leer el monto del comprobante';
  return { status: 'sospechoso', reason: [why].concat(notes).join('; '), matchedProduct: null, extracted };
}

async function recordReceipt(ws, extracted, v, conversationId) {
  await q('INSERT INTO receipts (workspace_id,conversation_id,reference,amount,beneficiary,bank,status,reason,extracted) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [ws.id, conversationId || null, extracted.reference ? String(extracted.reference) : null, extracted.amount ? Math.round(extracted.amount) : null,
     extracted.beneficiary || null, extracted.bank || null, v.status, v.reason, JSON.stringify(extracted)]);
}

// ---------- Conversions API (optimización por VENTA en Click-to-WhatsApp) ----------
// Envía el evento "Purchase" a Meta, amarrado al clic del anuncio (ctwa_clid), cuando se confirma una venta.
async function fireCapiPurchase(ws, convId, amount, currency) {
  try {
    if (!ws || !ws.capi_on || !ws.capi_dataset_id || !ws.capi_token || !convId) return;
    const conv = await one('SELECT ctwa_clid, capi_sent FROM conversations WHERE id=$1', [convId]);
    if (!conv || !conv.ctwa_clid || conv.capi_sent) return; // solo leads de anuncio, una sola vez
    // El monto se guarda en MONEDA LOCAL (Bs, pesos…). Las cuentas de anuncios de Meta están en USD,
    // así que SIEMPRE convertimos a dólares y mandamos currency:'USD'. Si mandáramos el número local
    // (ej. 780 Bs) con currency local, Meta usaría su propia tasa (mala para VES) y el ROAS saldría absurdo.
    const fxRow = await one('SELECT fx FROM countries WHERE code=$1', [ws.country_code]);
    const fx = (fxRow && Number(fxRow.fx) > 0) ? Number(fxRow.fx) : 1; // fiat por USD
    const valueUsd = Math.round(((Number(amount) || 0) / fx) * 100) / 100;
    const evt = { data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { whatsapp_business_account_id: ws.wa_waba_id || undefined, ctwa_clid: conv.ctwa_clid },
      custom_data: { currency: 'USD', value: valueUsd },
    }] };
    const r = await fetch(`https://graph.facebook.com/v21.0/${ws.capi_dataset_id}/events?access_token=${encodeURIComponent(ws.capi_token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(evt),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      await q('UPDATE conversations SET capi_sent=true WHERE id=$1', [convId]);
      const n = parseInt((await getSetting('capi_count_' + ws.id)) || '0', 10) + 1;
      await setSetting('capi_count_' + ws.id, String(n));
      await setSetting('capi_last_ok_' + ws.id, new Date().toISOString());
      console.log('[capi] Purchase enviado · ws', ws.id, '· conv', convId, '· total', n);
    } else {
      const em = (d.error && d.error.message) || ('HTTP ' + r.status);
      await setSetting('capi_last_err_' + ws.id, em.slice(0, 300));
      console.error('[capi] error ws', ws.id, em);
    }
  } catch (e) { console.error('[capi]', e.message); }
}

// Dispara un evento "Lead" a Meta CAPI en cuanto un cliente entra desde un anuncio (tiene ctwa_clid).
// Sirve para que el dataset se ACTIVE de inmediato y para medir el costo por lead, sin esperar a una venta.
// No lleva monto (value) — eso solo va en Purchase. Se manda una sola vez por conversación.
async function fireCapiLead(ws, convId) {
  try {
    if (!ws || !ws.capi_on || !ws.capi_dataset_id || !ws.capi_token || !convId) return;
    const conv = await one('SELECT ctwa_clid, capi_lead_sent FROM conversations WHERE id=$1', [convId]);
    if (!conv || !conv.ctwa_clid || conv.capi_lead_sent) return; // solo leads de anuncio, una sola vez
    const evt = { data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { whatsapp_business_account_id: ws.wa_waba_id || undefined, ctwa_clid: conv.ctwa_clid },
    }] };
    const r = await fetch(`https://graph.facebook.com/v21.0/${ws.capi_dataset_id}/events?access_token=${encodeURIComponent(ws.capi_token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(evt),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      await q('UPDATE conversations SET capi_lead_sent=true WHERE id=$1', [convId]);
      const n = parseInt((await getSetting('capi_lead_count_' + ws.id)) || '0', 10) + 1;
      await setSetting('capi_lead_count_' + ws.id, String(n));
      await setSetting('capi_last_ok_' + ws.id, new Date().toISOString());
      console.log('[capi] Lead enviado · ws', ws.id, '· conv', convId, '· total', n);
    } else {
      const em = (d.error && d.error.message) || ('HTTP ' + r.status);
      await setSetting('capi_last_err_' + ws.id, em.slice(0, 300));
      console.error('[capi] Lead error ws', ws.id, em);
    }
  } catch (e) { console.error('[capi lead]', e.message); }
}

// Registra una venta para una conversación (evita duplicados). Se usa al marcar "Cliente" a mano.
async function ensureSaleForConversation(ws, conv, source) {
  const existing = await one('SELECT id FROM sales WHERE workspace_id=$1 AND conversation_id=$2', [ws.id, conv.id]);
  if (existing) return existing.id;
  // Determinar producto/monto: por el último comprobante; si no, el producto PRINCIPAL (el más caro) por defecto.
  let productId = null, productName = 'Venta manual', amount = 0;
  const rc = await one("SELECT amount FROM receipts WHERE workspace_id=$1 AND conversation_id=$2 AND amount IS NOT NULL ORDER BY created_at DESC LIMIT 1", [ws.id, conv.id]);
  const prods = await many('SELECT * FROM products WHERE workspace_id=$1 ORDER BY price DESC', [ws.id]);
  let prod = null;
  if (rc && rc.amount != null) prod = prods.find(p => Math.abs(Number(p.price) - Number(rc.amount)) < 1) || null;
  if (!prod && prods.length) prod = prods[0]; // producto principal por defecto (para que la venta tenga monto real)
  if (prod) { productId = prod.id; productName = prod.name; amount = prod.price; }
  else if (rc && rc.amount != null) { amount = rc.amount; }
  const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source,conversation_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [ws.id, productId, productName, amount, (conv.name || 'Cliente'), source || 'manual', conv.id]);
  fireCapiPurchase(ws, conv.id, amount, ws.currency).catch(() => {});
  return s.id;
}

// Simulador / prueba de comprobante (para el módulo "Simulador del bot")
app.post('/api/receipts/verify', auth(async (req, res) => {
  const ws = req.workspace;
  let extracted;
  if (req.body.simulate) {
    extracted = { is_receipt: true, tampering: false, ...req.body.simulate };
  } else if (req.body.image_base64) {
    const b64 = req.body.image_base64.replace(/^data:[^;]+;base64,/, '');
    const mt = (req.body.image_base64.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
    extracted = await callClaudeVision(b64, mt);
    if (!extracted) return res.status(400).json({ error: 'Configura tu API key de Claude en Inteligencia IA (o usa el modo "simular datos").' });
  } else return res.status(400).json({ error: 'Envía una imagen o datos a simular' });
  const v = await verifyReceipt(ws, extracted);
  await recordReceipt(ws, extracted, v, null);
  let sale = null, delivery = null;
  if (v.status === 'valido' && v.matchedProduct) {
    const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [ws.id, v.matchedProduct.id, v.matchedProduct.name, v.matchedProduct.price, 'Comprobante', 'comprobante']);
    sale = { id: s.id, product: v.matchedProduct.name };
    delivery = v.matchedProduct.delivery_url;
  }
  res.json({ verdict: v.status, reason: v.reason, extracted, product: v.matchedProduct ? v.matchedProduct.name : null, sale, delivery });
}));

app.get('/api/receipts', auth(async (req, res) => {
  const list = await many('SELECT id,reference,amount,beneficiary,bank,status,reason,created_at FROM receipts WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100', [req.workspace.id]);
  res.json({ receipts: list });
}));

// Helpers de envío por WhatsApp (para la entrega automática)
// Devuelve las credenciales de WhatsApp de un workspace (cada país tiene su propio número/token).
function waCreds(ws) {
  return { phoneId: ws && ws.wa_phone_number_id, token: ws && ws.wa_token };
}
async function sendWa(ws, to, payload) {
  const r = await sendWaResult(ws, to, payload);
  return r.ok;
}
// Igual que sendWa pero devuelve el resultado real de Meta (para diagnosticar entregas)
async function sendWaResult(ws, to, payload) {
  const { phoneId, token } = waCreds(ws);
  if (!phoneId || !token) return { ok: false, error: 'Falta conectar WhatsApp de esta marca (Phone Number ID/token).' };
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
    });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok || d.error) {
      const msg = (d.error && (d.error.error_user_msg || d.error.message)) || ('HTTP ' + resp.status);
      const code = (d.error && (d.error.code || d.error.error_subcode)) ? (' (#' + (d.error.error_subcode || d.error.code) + ')') : '';
      const full = msg + code;
      await setSetting('wa_last_error', full);
      console.error('[sendWa] Meta rechazó:', full);
      return { ok: false, error: full };
    }
    await setSetting('wa_last_error', '');
    const id = d.messages && d.messages[0] && d.messages[0].id;
    return { ok: true, id };
  } catch (e) {
    await setSetting('wa_last_error', String(e.message || e));
    console.error('[sendWa] error de red:', e.message);
    return { ok: false, error: 'Error de red al enviar' };
  }
}
async function downloadWaMedia(ws, mediaId) {
  const { token } = waCreds(ws);
  if (!token) return null;
  const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  if (!meta.url) return null;
  const bin = await fetch(meta.url, { headers: { Authorization: 'Bearer ' + token } });
  const buf = Buffer.from(await bin.arrayBuffer());
  return { base64: buf.toString('base64'), mediaType: meta.mime_type || 'image/jpeg' };
}
// Lee los bytes de una imagen: si es una URL nuestra (/api/media/file/ID) la saca de la BD; si es externa, la descarga.
async function readImageBytes(url) {
  const m = String(url || '').match(/\/api\/media\/file\/(\d+)/);
  if (m) {
    const row = await one('SELECT data, mime FROM media WHERE id=$1', [parseInt(m[1], 10)]).catch(() => null);
    if (row && row.data) return { buffer: Buffer.from(row.data, 'base64'), mime: row.mime || 'image/jpeg' };
  }
  try { const r = await fetch(url); if (!r.ok) return null; const ab = await r.arrayBuffer(); return { buffer: Buffer.from(ab), mime: (r.headers.get('content-type') || 'image/jpeg').split(';')[0] }; }
  catch (e) { return null; }
}
// Transcribe una nota de voz con OpenAI Whisper (usa la misma llave de OpenAI).
async function transcribeAudio(base64, mediaType) {
  const key = await getSetting('openai_key');
  if (!key || !base64) return null;
  try {
    const buf = Buffer.from(base64, 'base64');
    const mt = mediaType || 'audio/ogg';
    const ext = /mp3|mpeg/i.test(mt) ? 'mp3' : /wav/i.test(mt) ? 'wav' : /m4a|mp4/i.test(mt) ? 'm4a' : /amr/i.test(mt) ? 'amr' : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mt }), 'audio.' + ext);
    form.append('model', 'whisper-1');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.text) return String(d.text).trim();
    console.error('[transcribe]', (d.error && d.error.message) || ('HTTP ' + r.status));
  } catch (e) { console.error('[transcribe]', e.message); }
  return null;
}
// Descarga la nota de voz, la transcribe y la trata como un mensaje de texto normal.
async function transcribeAndHandle(ws, convId, from, audioId, waMsgId) {
  const media = await downloadWaMedia(ws, audioId);
  const text = media ? await transcribeAudio(media.base64, media.mediaType) : null;
  if (!text) {
    await sendWa(ws, from, { type: 'text', text: { body: 'Recibí tu nota de voz 🎧 pero no la escuché del todo bien. ¿Me lo escribes en un mensajito? Así te ayudo al toque 🙌' } });
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '🤖 Pidió el mensaje por texto (no se pudo transcribir la nota de voz)']);
    return;
  }
  // Guarda la transcripción en el mensaje entrante (para verla en el chat)
  if (waMsgId) await q("UPDATE messages SET body=$1 WHERE wa_message_id=$2", ['🎤 ' + text, waMsgId]).catch(() => {});
  await q("UPDATE conversations SET last_message=$1 WHERE id=$2", ['🎤 ' + text.slice(0, 100), convId]).catch(() => {});
  const conv = await one('SELECT id, bot_active FROM conversations WHERE id=$1', [convId]);
  if (conv && conv.bot_active) await handleBotResponse(ws, { id: conv.id, bot_active: true }, from, text);
}
// Sube una imagen a WhatsApp y devuelve su media id (cacheado ~20 días). Enviar por id preserva el ORDEN.
async function waMediaId(ws, url) {
  const { phoneId, token } = waCreds(ws);
  if (!phoneId || !token || !url) return null;
  const key = 'waimg_' + phoneId + '_' + crypto.createHash('md5').update(String(url)).digest('hex');
  const cached = await getSetting(key);
  if (cached) { try { const o = JSON.parse(cached); if (o.id && (Date.now() - o.ts) < 20 * 24 * 3600 * 1000) return o.id; } catch (e) {} }
  const media = await readImageBytes(url);
  if (!media) return null;
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', media.mime);
    form.append('file', new Blob([media.buffer], { type: media.mime }), 'image');
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.id) { await setSetting(key, JSON.stringify({ id: d.id, ts: Date.now() })); return d.id; }
    console.error('[waMediaId]', (d.error && d.error.message) || ('HTTP ' + r.status));
  } catch (e) { console.error('[waMediaId]', e.message); }
  return null;
}
// Envía una imagen en ORDEN: por media id (subida previa); si falla, cae a link.
async function sendWaImageOrdered(ws, from, url, caption) {
  const id = await waMediaId(ws, url);
  if (id) { const r = await sendWaResult(ws, from, { type: 'image', image: caption ? { id, caption } : { id } }); if (r.ok) return true; }
  return await sendWa(ws, from, { type: 'image', image: caption ? { link: url, caption } : { link: url } });
}

// Procesa un comprobante que llega por WhatsApp (imagen o PDF) y entrega el producto si es válido
async function processIncomingReceipt(wsId, convId, from, mediaId, preMedia) {
  const ws = await one('SELECT * FROM workspaces WHERE id=$1', [wsId]);
  if (!ws) return;
  const media = preMedia || await downloadWaMedia(ws, mediaId);
  if (!media) return;
  // Intenta leer; si falla, reintenta una vez (a veces la IA falla la 1ra)
  let extracted = await callClaudeVision(media.base64, media.mediaType).catch(() => null);
  if (!extracted) extracted = await callClaudeVision(media.base64, media.mediaType).catch(() => null);
  if (!extracted) {
    // No se pudo leer -> pedir una foto/captura clara (para cualquier tipo de archivo)
    if (await getSetting('anthropic_key')) {
      const esPdf = /pdf/i.test(media.mediaType || '');
      const msg = esPdf
        ? 'Recibí tu comprobante en PDF pero no pude leerlo del todo 🙏. ¿Me mandas una *foto o captura de pantalla* del comprobante? Con la imagen lo confirmo al instante ✅'
        : 'Recibí tu comprobante pero la imagen no se ve del todo clara 🙏. ¿Me mandas otra *foto o captura* donde se vea bien el *monto* y a *quién le pagaste*? Así te activo el acceso al instante ✅';
      await sendWa(ws, from, { type: 'text', text: { body: msg } });
      await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '🤖 Pidió comprobante más claro (ilegible)']);
    }
    return;
  }
  // Texto reciente de la conversación + producto asignado por el flujo (para entregar el correcto)
  const convMsgs = await many("SELECT body FROM messages WHERE conversation_id=$1 AND body IS NOT NULL ORDER BY created_at DESC LIMIT 40", [convId]).catch(() => []);
  const convText = convMsgs.map(x => x.body).join(' ');
  const convRow = await one('SELECT product_id FROM conversations WHERE id=$1', [convId]).catch(() => null);
  const v = await verifyReceipt(ws, extracted, convText, convRow && convRow.product_id);
  await recordReceipt(ws, extracted, v, convId);
  // Monto REAL leído del comprobante (lo que el cliente realmente pagó)
  const proofAmt = extracted && extracted.amount != null ? Math.round(Number(String(extracted.amount).replace(/[^0-9.]/g, ''))) : null;
  // MOTOR DE VENTA: si la Oferta está activa y la conversación está en pago, el motor maneja el comprobante.
  const convF = await one('SELECT funnel_state, order_id, offer_id FROM conversations WHERE id=$1', [convId]);
  const offerRow = convF ? await getConvOffer(ws, convF.offer_id) : null;
  if (offerRow && offerRow.active && convF && ['PAYMENT_PENDING', 'UPSELL_PENDING'].includes(convF.funnel_state)) {
    await handleFunnelPayment(ws, convId, from, proofAmt, v, convF, offerRow, extracted).catch(e => console.error('funnel pay', e.message));
    return;
  }
  if (v.status === 'valido' && v.matchedProduct) {
    // Monto REAL del comprobante (lo que mandó el cliente); si no se leyó, el precio del producto.
    const saleAmt = (proofAmt && proofAmt > 0) ? proofAmt : v.matchedProduct.price;
    const dup = await one('SELECT id FROM sales WHERE workspace_id=$1 AND conversation_id=$2', [ws.id, convId]);
    if (!dup) { await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source,conversation_id,proof_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [ws.id, v.matchedProduct.id, v.matchedProduct.name, saleAmt, 'Comprobante', 'comprobante', convId, proofAmt]);
      notifySale(ws, v.matchedProduct.name, saleAmt, 'comprobante ✅');
      fireCapiPurchase(ws, convId, saleAmt, ws.currency).catch(() => {}); }
    // Entrega como LINK (enlace clickeable), no como archivo
    const entrega = v.matchedProduct.delivery_url
      ? `✅ ¡Pago confirmado! 🎉 Aquí tienes tu acceso completo a *${v.matchedProduct.name}*:\n\n${v.matchedProduct.delivery_url}\n\n¡Gracias por tu compra! 🙌`
      : '✅ ¡Pago confirmado! 🎉 En un momento te enviamos tu acceso.';
    await sendWa(ws, from, { type: 'text', text: { body: entrega, preview_url: true } });
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '✅ Pago confirmado, entregado (link): ' + v.matchedProduct.name]);
    await q("UPDATE conversations SET last_message=$1, last_at=now(), stage='cliente' WHERE id=$2", ['✅ Pago confirmado y entregado', convId]);
  } else {
    await sendWa(ws, from, { type: 'text', text: { body: '🔎 Recibí tu comprobante. Lo estoy verificando y en breve te confirmo.' } });
    await q('UPDATE conversations SET bot_active=false WHERE id=$1', [convId]); // pasa a humano
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '⚠️ Comprobante para revisar (' + v.status + '): ' + v.reason]);
    notifySale && sendPush(ws.user_id, { title: '⚠️ Comprobante por revisar ' + (ws.flag || '') + ' ' + ws.name, body: (v.reason || 'Revísalo en Chat en Vivo'), url: '/' });
  }
}

// El motor maneja el comprobante cuando la conversación está pagando (principal o upsell).
async function handleFunnelPayment(ws, convId, from, proofAmt, v, convF, offer, extracted) {
  const conv = { id: convId, order_id: convF.order_id };
  let order = convF.order_id ? await one('SELECT * FROM orders WHERE id=$1', [convF.order_id]) : null;
  // Validación FLEXIBLE contra el monto de la ORDEN (no el catálogo): acepta si es un recibo real
  // y pagó al menos ~80% de lo esperado. Así no importa que el precio del catálogo difiera del flujo.
  const expected = order ? Number(order.ves_total) : null;
  const isReceipt = !extracted || extracted.is_receipt !== false;   // salvo que la IA diga que NO es comprobante
  const tampered = extracted && extracted.tampering === true;
  const amtOk = (proofAmt && proofAmt > 0 && expected) ? (proofAmt >= expected * 0.8) : true; // pagó ≥80% del total
  if (!isReceipt || tampered || !amtOk) {
    const reason = !isReceipt ? 'No parece un comprobante' : (tampered ? 'Posible edición del comprobante' : 'Monto menor al esperado');
    await sendWa(ws, from, { type: 'text', text: { body: '🔎 Recibí tu comprobante. Lo estoy verificando y en breve te confirmo.' } });
    await q('UPDATE conversations SET bot_active=false WHERE id=$1', [convId]);
    if (order) await q("UPDATE orders SET payment_status='review', proof_amount=$2 WHERE id=$1", [order.id, proofAmt]);
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '⚠️ Comprobante por revisar: ' + reason]);
    sendPush(ws.user_id, { title: '⚠️ Comprobante por revisar ' + (ws.flag || '') + ' ' + ws.name, body: reason, url: '/' });
    return;
  }
  if (convF.funnel_state === 'UPSELL_PENDING') {
    if (order) await q("UPDATE orders SET upsell_status='accepted', proof_amount=COALESCE(proof_amount,0)+$2 WHERE id=$1", [order.id, proofAmt || 0]);
    order = order ? await one('SELECT * FROM orders WHERE id=$1', [order.id]) : null;
    await registerFunnelSale(ws, convId, order, offer, proofAmt, 'Upsell Camiones', offer.upsell_product_id);
    await deliverOrder(ws, conv, from, offer, order);
    return;
  }
  // PAYMENT_PENDING -> pago principal confirmado
  if (order) await q("UPDATE orders SET payment_status='paid', paid_at=now(), proof_amount=$2 WHERE id=$1", [order.id, proofAmt]);
  order = order ? await one('SELECT * FROM orders WHERE id=$1', [order.id]) : null;
  await setFunnel(convId, 'PAID_MAIN');
  await q("UPDATE conversations SET stage='cliente' WHERE id=$1", [convId]);
  await addConvTags(convId, [stageTag(offer, 'pago'), stageTag(offer, 'cliente')]);
  await registerFunnelSale(ws, convId, order, offer, proofAmt, 'Pack Automotriz (orden)', offer.main_product_id);
  await funnelEvent(ws, convId, order ? order.id : null, 'payment.verified');
  // CAPI: dispara Compra con el monto LOCAL de la orden (fireCapiPurchase lo convierte a USD).
  fireCapiPurchase(ws, convId, (proofAmt && proofAmt > 0) ? proofAmt : (order ? order.ves_total : 0), ws.currency).catch(() => {});
  // ¿Hay upsell configurado? Ofrecerlo; si no, entregar de una.
  if (offer.upsell_product_id && Number(offer.upsell_usd) > 0) {
    await sendFunnelText(ws, conv, from, '✅ *PAGO CONFIRMADO.* Ya quedó registrada tu compra 🎉');
    await funnelSleep(800);
    const vars = await offerVars(ws, offer, order);
    await sendKeyButtons(ws, conv, from, offer, 'upsell_offer', vars, [{ id: 'UP_SI', title: 'SÍ, agregar' }, { id: 'UP_NO', title: 'No, gracias' }]);
    await setFunnel(convId, 'UPSELL_OFFERED');
    await funnelEvent(ws, convId, order ? order.id : null, 'upsell.camiones.offered');
  } else {
    await deliverOrder(ws, conv, from, offer, order);
  }
}
async function registerFunnelSale(ws, convId, order, offer, proofAmt, name, productId) {
  const conv = await one('SELECT name FROM conversations WHERE id=$1', [convId]);
  // MONTO REAL: lo que el cliente realmente mandó en el comprobante; si no se leyó, el total de la orden.
  const amountLocal = (proofAmt && proofAmt > 0) ? proofAmt : (order ? Number(order.ves_total) : 0);
  // Evita duplicar la venta principal de la misma orden
  if (order) { const dup = await one('SELECT id FROM sales WHERE workspace_id=$1 AND conversation_id=$2 AND order_id=$3 AND product_name=$4', [ws.id, convId, order.id, name]); if (dup) return; }
  await q('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source,conversation_id,order_id,proof_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [ws.id, productId || null, name, Math.round(amountLocal), (conv && conv.name) || 'Cliente', 'comprobante', convId, order ? order.id : null, proofAmt]);
  notifySale(ws, name, amountLocal, 'comprobante ✅');
}

// ---------- Flujos (constructor tipo GoHighLevel) ----------
app.get('/api/flows', auth(async (req, res) => {
  const list = await many('SELECT * FROM flows WHERE workspace_id=$1 ORDER BY id DESC', [req.workspace.id]);
  res.json({ flows: list });
}));
app.get('/api/flows/:id', auth(async (req, res) => {
  const f = await one('SELECT * FROM flows WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!f) return res.status(404).json({ error: 'No encontrado' });
  res.json({ flow: f });
}));
app.post('/api/flows/save-flow', auth(async (req, res) => {
  const { id, name, trigger_type, trigger_value, steps, active } = req.body || {};
  const pid = req.body.product_id ? parseInt(req.body.product_id, 10) : null;
  const st = JSON.stringify(steps || []);
  if (id) {
    await q('UPDATE flows SET name=$1,trigger_type=$2,trigger_value=$3,steps=$4,active=$5,product_id=$6 WHERE id=$7 AND workspace_id=$8',
      [name, trigger_type, trigger_value || null, st, active !== false, pid, id, req.workspace.id]);
    return res.json({ id });
  }
  const f = await one('INSERT INTO flows (workspace_id,name,trigger_type,trigger_value,steps,active,product_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [req.workspace.id, name || 'Nuevo flujo', trigger_type || 'keyword', trigger_value || null, st, active !== false, pid]);
  res.json({ id: f.id });
}));
app.post('/api/flows/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM flows WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  res.json({ ok: true });
}));

// ---------- Ofertas (motor de venta config-driven) ----------
app.get('/api/offers', auth(async (req, res) => {
  const rows = await many("SELECT id,name,active,trigger_type,trigger_value,updated_at FROM offer_config WHERE workspace_id=$1 ORDER BY id", [req.workspace.id]);
  res.json({ offers: rows, flag: req.workspace.flag, workspace_name: req.workspace.name });
}));
app.get('/api/offer', auth(async (req, res) => {
  const ws = req.workspace;
  const id = req.query.id ? parseInt(req.query.id, 10) : null;
  const offer = (id ? await one('SELECT * FROM offer_config WHERE id=$1 AND workspace_id=$2', [id, ws.id]) : null) || {};
  const products = await many('SELECT id,name,price,delivery_url FROM products WHERE workspace_id=$1 ORDER BY price DESC', [ws.id]);
  const others = await many('SELECT id,name,country_code,flag FROM workspaces WHERE user_id=$1 AND id<>$2 ORDER BY name', [req.accountId, ws.id]).catch(() => []);
  res.json({
    offer: {
      id: offer.id || null, name: offer.name || '', active: !!offer.active,
      main_product_id: offer.main_product_id || null, bump_product_id: offer.bump_product_id || null,
      upsell_product_id: offer.upsell_product_id || null, downsell_product_id: offer.downsell_product_id || null,
      main_usd: offer.main_usd || 0, bump_usd: offer.bump_usd || 0, upsell_usd: offer.upsell_usd || 0, downsell_usd: offer.downsell_usd || 0,
      gifts: offer.gifts || [], sample: offer.sample || { enabled: false, name: '', delivery_url: '' },
      messages: offer.messages || {}, urgency_on: !!offer.urgency_on, urgency_text: offer.urgency_text || '',
      tags_map: offer.tags_map || {}, trigger_type: offer.trigger_type || 'any', trigger_value: offer.trigger_value || '',
      followup_steps: offer.followup_steps || [], pay_followup_steps: offer.pay_followup_steps || [],
      pace_seconds: offer.pace_seconds != null ? offer.pace_seconds : 3,
      product_tag: offer.product_tag || '', payment_info: offer.payment_info || '',
      price_currency: offer.price_currency || 'usd', payment_method_ids: offer.payment_method_ids || [],
    },
    defaults: defaultOfferMessages(), tag_defaults: TAG_DEFAULTS,
    products, others, currency: ws.currency, flag: ws.flag, workspace_name: ws.name,
    methods: await many('SELECT id,label,type,detail FROM payment_methods WHERE workspace_id=$1 ORDER BY id', [ws.id]).catch(() => []),
  });
}));
app.post('/api/offer', auth(async (req, res) => {
  const ws = req.workspace; const b = req.body || {};
  const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const pid = v => (v ? parseInt(v, 10) : null);
  const gifts = Array.isArray(b.gifts) ? b.gifts.filter(g => g && g.name).map(g => ({ name: String(g.name), ref_value: num(g.ref_value), delivery_url: String(g.delivery_url || '') })) : [];
  const sample = (b.sample && typeof b.sample === 'object') ? { enabled: !!b.sample.enabled, name: String(b.sample.name || ''), delivery_url: String(b.sample.delivery_url || '') } : {};
  const messages = (b.messages && typeof b.messages === 'object') ? b.messages : {};
  const tagsMap = (b.tags_map && typeof b.tags_map === 'object') ? b.tags_map : {};
  const tt = ['any', 'keyword', 'ad'].includes(b.trigger_type) ? b.trigger_type : 'any';
  const fu = Array.isArray(b.followup_steps) ? b.followup_steps.filter(s => s && String(s.text || '').trim()).map(s => ({ after_min: Math.max(1, Number(s.after_min) || 30), text: String(s.text) })) : [];
  const pf = Array.isArray(b.pay_followup_steps) ? b.pay_followup_steps.filter(s => s && String(s.text || '').trim()).map(s => ({ after_min: Math.max(1, Number(s.after_min) || 30), text: String(s.text) })) : [];
  const pace = Math.max(0.6, Math.min(12, Number(b.pace_seconds) || 3));
  const name = String(b.name || '').trim() || 'Flujo de venta';
  const ptag = String(b.product_tag || '').trim().toLowerCase();
  const pcur = (b.price_currency === 'local') ? 'local' : 'usd';
  const payInfo = String(b.payment_info || '').trim();
  const payIds = Array.isArray(b.payment_method_ids) ? b.payment_method_ids.map(Number).filter(n => !isNaN(n)) : [];
  const cols = [name, !!b.active, pid(b.main_product_id), pid(b.bump_product_id), pid(b.upsell_product_id), pid(b.downsell_product_id),
    num(b.main_usd), num(b.bump_usd), num(b.upsell_usd), num(b.downsell_usd), JSON.stringify(gifts), JSON.stringify(sample), JSON.stringify(messages),
    !!b.urgency_on, String(b.urgency_text || ''), JSON.stringify(tagsMap), tt, String(b.trigger_value || ''), JSON.stringify(fu), pace, ptag, pcur, payInfo, JSON.stringify(payIds), JSON.stringify(pf)];
  const idIn = b.id ? parseInt(b.id, 10) : null;
  if (idIn) {
    const own = await one('SELECT id FROM offer_config WHERE id=$1 AND workspace_id=$2', [idIn, ws.id]);
    if (!own) return res.status(404).json({ error: 'Flujo no encontrado' });
    await q(`UPDATE offer_config SET name=$1,active=$2,main_product_id=$3,bump_product_id=$4,upsell_product_id=$5,downsell_product_id=$6,main_usd=$7,bump_usd=$8,upsell_usd=$9,downsell_usd=$10,gifts=$11,sample=$12,messages=$13,urgency_on=$14,urgency_text=$15,tags_map=$16,trigger_type=$17,trigger_value=$18,followup_steps=$19,pace_seconds=$20,product_tag=$21,price_currency=$22,payment_info=$23,payment_method_ids=$24,pay_followup_steps=$25,updated_at=now() WHERE id=$26`, [...cols, idIn]);
    return res.json({ ok: true, id: idIn });
  }
  const r = await one(`INSERT INTO offer_config (name,active,main_product_id,bump_product_id,upsell_product_id,downsell_product_id,main_usd,bump_usd,upsell_usd,downsell_usd,gifts,sample,messages,urgency_on,urgency_text,tags_map,trigger_type,trigger_value,followup_steps,pace_seconds,product_tag,price_currency,payment_info,payment_method_ids,pay_followup_steps,workspace_id,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,now()) RETURNING id`, [...cols, ws.id]);
  res.json({ ok: true, id: r.id });
}));
app.post('/api/offer/delete', auth(async (req, res) => {
  const id = parseInt(req.body && req.body.id, 10);
  if (!id) return res.status(400).json({ error: 'Falta id' });
  await q('DELETE FROM offer_config WHERE id=$1 AND workspace_id=$2', [id, req.workspace.id]);
  res.json({ ok: true });
}));
// Probar el guion: reinicia desde cero y manda la secuencia completa al número indicado.
app.post('/api/offer/test', auth(async (req, res) => {
  const ws = req.workspace;
  const id = parseInt(req.body && req.body.id, 10);
  const to = String((req.body && req.body.to) || '').replace(/[^0-9]/g, '');
  if (!id) return res.status(400).json({ error: 'Guarda el flujo primero.' });
  if (!to || to.length < 8) return res.status(400).json({ error: 'Pon tu número con código de país, sin + (ej: 584121234567).' });
  const offer = await one('SELECT * FROM offer_config WHERE id=$1 AND workspace_id=$2', [id, ws.id]);
  if (!offer) return res.status(404).json({ error: 'Flujo no encontrado.' });
  const cr = waCreds(ws);
  if (!cr.phoneId || !cr.token) return res.status(400).json({ error: 'Conecta el WhatsApp de esta marca primero (Conectar WhatsApp).' });
  // PRE-CHEQUEO: WhatsApp solo deja mandar mensajes libres dentro de la ventana de 24h desde que
  // el cliente escribió. Enviamos un primer mensaje y, si Meta lo rechaza, avisamos el motivo real.
  const pre = await sendWaResult(ws, to, { type: 'text', text: { body: '🧪 Prueba de PDFmania — te envío el guion completo 👇' } });
  if (!pre.ok) {
    const win = /24|reengag|customer|window|132|131047|131051/i.test(pre.error || '');
    const extra = win ? ' — Para probar, ese número debe ESCRIBIRTE primero (manda cualquier mensaje al WhatsApp del negocio) y vuelve a intentar dentro de las 24h.' : '';
    return res.status(400).json({ error: 'WhatsApp no envió: ' + (pre.error || 'error') + extra });
  }
  // Conversación de prueba (crea o reusa) y reinicio DESDE CERO
  const conv = await one(`INSERT INTO conversations (workspace_id,wa_id,name,last_message,bot_active) VALUES ($1,$2,$3,$4,true)
     ON CONFLICT (workspace_id,wa_id) DO UPDATE SET name=COALESCE(conversations.name,$3) RETURNING id`, [ws.id, to, 'Prueba', ' ']);
  await q("UPDATE conversations SET funnel_state='MAIN_SENDING', offer_id=$1, order_id=NULL, motor_fu_at=NULL, stage='nuevo' WHERE id=$2", [offer.id, conv.id]);
  const ptag = productTagOf(offer); if (ptag) await addConvTags(conv.id, [ptag]);
  // Se envía en segundo plano (el guion tarda unos segundos con el ritmo configurado)
  sendMainSequence(ws, { id: conv.id, order_id: null }, to, offer).catch(e => console.error('[test send]', e.message));
  res.json({ ok: true, message: '✅ Prueba en camino a ' + to + ' — el guion llega en unos segundos (según el ritmo).' });
}));
// Prueba INSTANTÁNEA de una rama de seguimiento: manda los pasos seguidos, sin esperar el reloj
// de 15 min ni los "X minutos de silencio". Sirve para comprobar contenido y orden al momento.
app.post('/api/offer/test-followup', auth(async (req, res) => {
  const ws = req.workspace;
  const id = parseInt(req.body && req.body.id, 10);
  const to = String((req.body && req.body.to) || '').replace(/[^0-9]/g, '');
  const branch = (req.body && req.body.branch) === 'pay' ? 'pay' : 'noreply';
  if (!id) return res.status(400).json({ error: 'Guarda el flujo primero.' });
  if (!to || to.length < 8) return res.status(400).json({ error: 'Pon tu número con código de país, sin + (ej: 584121234567).' });
  const offer = await one('SELECT * FROM offer_config WHERE id=$1 AND workspace_id=$2', [id, ws.id]);
  if (!offer) return res.status(404).json({ error: 'Flujo no encontrado.' });
  const cr = waCreds(ws);
  if (!cr.phoneId || !cr.token) return res.status(400).json({ error: 'Conecta el WhatsApp de esta marca primero (Conectar WhatsApp).' });
  const steps = branch === 'pay' ? paySteps(offer) : noReplySteps(offer);
  if (!steps.length) return res.status(400).json({ error: branch === 'pay' ? 'La rama "Abandonó el pago" está vacía. Agrégale pasos y guarda el flujo.' : 'La rama "No contestó" está vacía. Agrégale pasos y guarda el flujo.' });
  const label = branch === 'pay' ? '💳 Prueba de recordatorios de PAGO' : '⏰ Prueba de seguimiento (no contestó)';
  const pre = await sendWaResult(ws, to, { type: 'text', text: { body: label + ' — te mando los ' + steps.length + ' paso(s) seguidos para que veas cómo llegan 👇' } });
  if (!pre.ok) {
    const win = /24|reengag|customer|window|132|131047|131051/i.test(pre.error || '');
    const extra = win ? ' — Ese número debe ESCRIBIRTE primero (manda cualquier mensaje al WhatsApp del negocio) y reintenta dentro de las 24h.' : '';
    return res.status(400).json({ error: 'WhatsApp no envió: ' + (pre.error || 'error') + extra });
  }
  (async () => {
    const conv = await one(`INSERT INTO conversations (workspace_id,wa_id,name,last_message,bot_active) VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (workspace_id,wa_id) DO UPDATE SET name=COALESCE(conversations.name,$3) RETURNING id`, [ws.id, to, 'Prueba', ' ']);
    const v = await offerVars(ws, offer, null);
    for (let i = 0; i < steps.length; i++) {
      await funnelSleep(paceMs(offer) + 600);
      await sendFunnelText(ws, { id: conv.id }, to, fillVars(steps[i].text, v));
    }
  })().catch(e => console.error('[test followup]', e.message));
  res.json({ ok: true, message: '✅ Prueba de ' + (branch === 'pay' ? 'recordatorios de pago' : 'seguimiento') + ' en camino a ' + to + ' (' + steps.length + ' paso(s), llegan en unos segundos).' });
}));
app.post('/api/offer/duplicate', auth(async (req, res) => {
  const srcId = parseInt(req.body && req.body.id, 10);
  const targetId = parseInt(req.body && req.body.target_id, 10);
  if (!srcId || !targetId) return res.status(400).json({ error: 'Elige el flujo y el país destino' });
  const src = await one('SELECT * FROM offer_config WHERE id=$1 AND workspace_id=$2', [srcId, req.workspace.id]);
  if (!src) return res.status(404).json({ error: 'Flujo origen no encontrado' });
  const target = await one('SELECT * FROM workspaces WHERE id=$1 AND user_id=$2', [targetId, req.accountId]);
  if (!target) return res.status(404).json({ error: 'País destino no encontrado' });
  // Clona el flujo EXCEPTO los productos (son por país) y lo deja DESACTIVADO por seguridad.
  await q(`INSERT INTO offer_config (workspace_id,name,active,main_usd,bump_usd,upsell_usd,downsell_usd,gifts,sample,messages,urgency_on,urgency_text,tags_map,trigger_type,trigger_value,followup_steps,pace_seconds,product_tag,pay_followup_steps,updated_at)
    VALUES ($1,$2,false,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())`,
    [targetId, (src.name || 'Flujo') + ' (copia)', src.main_usd, src.bump_usd, src.upsell_usd, src.downsell_usd, JSON.stringify(src.gifts || []), JSON.stringify(src.sample || {}), JSON.stringify(src.messages || {}), src.urgency_on, src.urgency_text, JSON.stringify(src.tags_map || {}), src.trigger_type || 'any', src.trigger_value || '', JSON.stringify(src.followup_steps || []), src.pace_seconds != null ? src.pace_seconds : 3, src.product_tag || null, JSON.stringify(src.pay_followup_steps || [])]);
  res.json({ ok: true, message: 'Flujo duplicado a ' + (target.flag || '') + ' ' + target.name + '. Ajusta productos, datos de pago e idioma, y actívalo allí.' });
}));
app.get('/api/offer/kpis', auth(async (req, res) => {
  const ws = req.workspace;
  const id = req.query.id ? parseInt(req.query.id, 10) : null;
  const ev = async (name) => (await one(
    id ? "SELECT COUNT(*)::int c FROM funnel_events fe JOIN conversations c ON c.id=fe.conversation_id WHERE fe.workspace_id=$1 AND fe.event=$2 AND c.offer_id=$3"
       : "SELECT COUNT(*)::int c FROM funnel_events WHERE workspace_id=$1 AND event=$2",
    id ? [ws.id, name, id] : [ws.id, name])).c;
  const [mainSent, interest, bumpOffered, bumpAccepted, upsellOffered, upsellAccepted, paymentInstr, paid, delivered] = await Promise.all(
    ['main_flow.sent', 'interest.confirmed', 'bump.motos.offered', 'bump.motos.accepted', 'upsell.camiones.offered', 'upsell.camiones.accepted', 'payment.instructions.sent', 'payment.verified', 'delivery.sent'].map(ev));
  const orders = await one(
    id ? "SELECT COUNT(*)::int c, COALESCE(AVG(usd_total),0)::float8 aov, COALESCE(SUM(usd_total),0)::float8 rev FROM orders o JOIN conversations c ON c.id=o.conversation_id WHERE o.workspace_id=$1 AND o.payment_status='paid' AND c.offer_id=$2"
       : "SELECT COUNT(*)::int c, COALESCE(AVG(usd_total),0)::float8 aov, COALESCE(SUM(usd_total),0)::float8 rev FROM orders WHERE workspace_id=$1 AND payment_status='paid'",
    id ? [ws.id, id] : [ws.id]);
  const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : null;
  res.json({
    leads: mainSent, interest, paid, delivered,
    close_rate: pct(paid, mainSent), interest_rate: pct(interest, mainSent),
    bump_rate: pct(bumpAccepted, bumpOffered), upsell_rate: pct(upsellAccepted, upsellOffered),
    payment_abandon: pct(Math.max(0, paymentInstr - paid), paymentInstr),
    aov_usd: Math.round((orders.aov || 0) * 100) / 100, revenue_usd: Math.round((orders.rev || 0) * 100) / 100, paid_orders: orders.c,
  });
}));

// Runtime de flujos
async function claudeReply(systemPrompt, userText) {
  const key = await getSetting('anthropic_key');
  if (!key) return null;
  const model = (await getSetting('anthropic_model')) || 'claude-sonnet-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 500, system: systemPrompt || 'Eres un asesor de ventas amable de PDFmania.', messages: [{ role: 'user', content: userText || 'Hola' }] }),
  });
  const d = await r.json();
  if (!r.ok) return null;
  return (d.content && d.content[0] && d.content[0].text) || null;
}
async function executeFlow(ws, conv, from, flow, text) {
  const steps = Array.isArray(flow.steps) ? flow.steps : JSON.parse(flow.steps || '[]');
  for (const step of steps) {
    if (step.type === 'message' && step.text) {
      await sendWa(ws, from, { type: 'text', text: { body: step.text } });
      await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, step.text]);
    } else if (step.type === 'media' && step.url) {
      await sendWa(ws, from, { type: 'document', document: { link: step.url, filename: (step.filename || 'archivo') } });
      await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'document')", [conv.id, '📎 ' + (step.filename || 'archivo')]);
    } else if (step.type === 'image' && step.url) {
      await sendWa(ws, from, { type: 'image', image: { link: step.url, caption: step.caption || undefined } });
      await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'image')", [conv.id, '🖼️ imagen' + (step.caption ? ': ' + step.caption : '')]);
    } else if (step.type === 'audio' && step.url) {
      await sendWa(ws, from, { type: 'audio', audio: { link: step.url } });
      await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'audio')", [conv.id, '🎤 nota de voz']);
    } else if (step.type === 'ai') {
      // El paso IA ahora responde CON MEMORIA de toda la conversación y el cerebro vendedor enfocado al producto.
      const focus = await getConvFocusProduct(ws, conv.id);
      const rows = await many('SELECT direction, body FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 16', [conv.id]);
      const msgs = toClaudeMessages(rows.reverse());
      const sys = (await buildSalesSystem(ws, focus)) + (step.prompt ? '\n\nOBJETIVO DE ESTE MOMENTO DEL FLUJO:\n' + step.prompt : '');
      const out = await chatComplete(sys, msgs.length ? msgs : [{ role: 'user', content: text || 'Hola' }]);
      const reply = (out && out.text) ? out.text : null;
      if (reply) { await sendWa(ws, from, { type: 'text', text: { body: reply } }); await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, reply]); }
    } else if (step.type === 'wait') {
      // Respeta el tiempo de espera del flujo (máx 60s para no colgar el proceso)
      const secs = Math.max(0, Math.min(60, Number(step.seconds) || 0));
      if (secs > 0) await new Promise(r => setTimeout(r, secs * 1000));
    } else if (step.type === 'condition') {
      let ok = true;
      if (step.contains) {
        const low = normText(text);
        const kws = step.contains.split(/[;,]/).map(k => normText(k.trim())).filter(Boolean);
        ok = kws.some(k => low.includes(k));
      }
      if (!ok) break;
    } else if (step.type === 'takeover') {
      await q('UPDATE conversations SET bot_active=false WHERE id=$1', [conv.id]); break;
    }
  }
  await q('UPDATE conversations SET last_at=now() WHERE id=$1', [conv.id]);
}
// Normaliza: minúsculas y sin acentos (para que "mecánica" y "mecanica" coincidan)
function normText(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
async function runFlows(ws, conv, from, text) {
  const flows = await many('SELECT * FROM flows WHERE workspace_id=$1 AND active=true', [ws.id]);
  const low = normText(text);
  const msgCount = (await one('SELECT COUNT(*)::int c FROM messages WHERE conversation_id=$1', [conv.id])).c;
  for (const f of flows) {
    let match = false;
    // 'any_message' se trata como apertura (solo el primer mensaje) para que el guion NO se repita
    // en cada respuesta del cliente — eso mataba la conversación. Tras la apertura, cierra el agente IA (con memoria).
    if (f.trigger_type === 'any_message') match = (msgCount <= 1);
    else if (f.trigger_type === 'first_message') match = (msgCount <= 1);
    else if (f.trigger_type === 'keyword') {
      // Varias palabras clave separadas por ; o , — dispara si el mensaje contiene CUALQUIERA
      const kws = (f.trigger_value || '').split(/[;,]/).map(k => normText(k.trim())).filter(Boolean);
      match = kws.some(k => low.includes(k));
    }
    if (!match) continue;
    // Si el flujo tiene producto asignado, marca la conversación con ese producto (para entregar el correcto al pagar)
    if (f.product_id) await q('UPDATE conversations SET product_id=$1 WHERE id=$2', [f.product_id, conv.id]).catch(() => {});
    await executeFlow(ws, conv, from, f, text);
    return true; // un flujo se hizo cargo
  }
  return false;
}

// Convierte el historial de la conversación a mensajes para Claude (alterna user/assistant, empieza en user)
function toClaudeMessages(rows) {
  const msgs = [];
  for (const m of rows) {
    const role = m.direction === 'in' ? 'user' : 'assistant';
    const content = (m.body || '').trim();
    if (!content) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + content;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

// Producto por el que llegó el cliente (para que el agente cierre ESE producto, no todo el catálogo)
async function getConvFocusProduct(ws, convId) {
  try {
    const c = await one('SELECT product_id FROM conversations WHERE id=$1', [convId]);
    if (c && c.product_id) return await one('SELECT name, price FROM products WHERE id=$1 AND workspace_id=$2', [c.product_id, ws.id]);
  } catch (e) {}
  return null;
}
// El agente vendedor responde solo, usando el historial de la conversación
async function agentAutoReply(ws, conv, from) {
  const key = await getSetting('anthropic_key');
  if (!key) return; // sin IA configurada, no responde solo
  const rows = await many('SELECT direction, body FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 16', [conv.id]);
  const msgs = toClaudeMessages(rows.reverse());
  if (!msgs.length) return;
  const focus = await getConvFocusProduct(ws, conv.id);
  const system = await buildSalesSystem(ws, focus);
  const out = await chatComplete(system, msgs);
  if (out.error || !out.text) return;
  await sendWa(ws, from, { type: 'text', text: { body: out.text } });
  await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, out.text]);
  await q("UPDATE conversations SET last_message=$1, last_at=now(), stage=CASE WHEN stage='nuevo' THEN 'conversando' ELSE stage END WHERE id=$2",
    [out.text.slice(0, 120), conv.id]);
}

// ============================================================================
//  MOTOR DE VENTA (config-driven) — máquina de estados determinística.
//  La plataforma es dueña del ESTADO y del DINERO; la IA solo clasifica y redacta.
//  Estados: NEW_LEAD → AWAITING_INTEREST → BUMP_OFFERED → PAYMENT_PENDING →
//           PAID_MAIN → UPSELL_OFFERED → UPSELL_PENDING → DELIVERED
//           (+ PRICE_OBJECTION, REMARKETING, OPT_OUT)
// ============================================================================
const funnelSleep = ms => new Promise(r => setTimeout(r, Math.min(15000, Math.max(0, ms || 0))));
function paceMs(offer) { const s = Number(offer && offer.pace_seconds); return Math.max(600, Math.min(12000, (isNaN(s) ? 3 : s) * 1000)); }
function imgFor(offer, key) { return (offer.messages && offer.messages[key + '_image_url']) ? offer.messages[key + '_image_url'] : null; }
function offerSym(ws) { return ({ VES: 'Bs ', COP: '$', MXN: '$', ARS: '$', CRC: '₡', PEN: 'S/ ', BRL: 'R$ ', GTQ: 'Q', DOP: 'RD$ ', USD: '$', PYG: '₲', BOB: 'Bs ', UYU: '$' })[ws.currency] || ((ws.currency || '') + ' '); }
function fmtLocal(ws, n) { return offerSym(ws) + Math.round(Number(n) || 0).toLocaleString('es-ES'); }
function fillVars(text, vars) { return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '')); }
function waButtonsPayload(bodyText, buttons) {
  return { type: 'interactive', interactive: { type: 'button', body: { text: String(bodyText).slice(0, 1024) }, action: { buttons: buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id, title: String(b.title).slice(0, 20) } })) } } };
}
// Primer flujo activo del país (compat) — para chequeos de "¿hay motor?"
async function getOffer(ws) { return await one('SELECT * FROM offer_config WHERE workspace_id=$1 AND active=true ORDER BY id LIMIT 1', [ws.id]); }
// Elige el flujo Power cuyo disparador aplica a este lead (primero por id)
async function pickOffer(ws, ctwaClid, body) {
  const list = await many('SELECT * FROM offer_config WHERE workspace_id=$1 AND active=true ORDER BY id', [ws.id]);
  for (const o of list) { if (triggerMatches(o, ctwaClid, body)) return o; }
  return null;
}
// Carga el flujo asignado a una conversación (o cae al primer activo, para conversaciones antiguas)
async function getConvOffer(ws, offerId) {
  if (offerId) { const o = await one('SELECT * FROM offer_config WHERE id=$1', [offerId]); if (o) return o; }
  return await getOffer(ws);
}
// Nombres de etiquetas por defecto (editables por producto/flujo desde el motor)
const TAG_DEFAULTS = { interesado: 'interesado', objecion: 'objetó-precio', bump: 'pidió-motos', gratis: 'pidió-gratis', pago: 'pagó', cliente: 'cliente', upsell: 'pidió-camiones', entregado: 'entregado', nomolestar: 'no-molestar', 'pago-abandonado': 'pago-abandonado' };
function tagFor(offer, key) {
  const m = (offer && offer.tags_map && typeof offer.tags_map === 'object') ? offer.tags_map : {};
  const v = (m[key] != null && String(m[key]).trim()) ? String(m[key]).trim() : (TAG_DEFAULTS[key] || key);
  return v;
}
// Etiqueta de producto de un flujo: la configurada, o un slug del nombre (ej. "Flujo Automotriz" -> "automotriz")
function productTagOf(offer) {
  if (offer && offer.product_tag && String(offer.product_tag).trim()) return String(offer.product_tag).trim().toLowerCase();
  if (offer && offer.name) { const s = normText(offer.name).replace(/^flujo[\s-]*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return s || null; }
  return null;
}
// Etiqueta de ESTADO pegada al producto: "interesado" + "automotriz" -> "interesado-automotriz"
function stageTag(offer, key) { const base = tagFor(offer, key); const p = productTagOf(offer); return p ? (base + '-' + p) : base; }
// ¿El disparador de este flujo aplica a este lead?
function triggerMatches(offer, ctwaClid, body) {
  const tt = offer.trigger_type || 'any';
  if (tt === 'ad') return !!ctwaClid;
  if (tt === 'keyword') {
    const low = normText(body || '');
    const kws = (offer.trigger_value || '').split(/[;,]/).map(k => normText(k.trim())).filter(Boolean);
    return kws.length ? kws.some(k => low.includes(k)) : true;
  }
  return true; // 'any'
}
// Pasos de la rama "no contestó" (silencio tras la secuencia)
function noReplySteps(offer) { return Array.isArray(offer.followup_steps) ? offer.followup_steps.filter(s => s && s.text) : []; }
// Pasos de la rama "abandonó el pago" (recibió datos de pago y desapareció sin comprobante)
function paySteps(offer) { return Array.isArray(offer.pay_followup_steps) ? offer.pay_followup_steps.filter(s => s && s.text) : []; }
// ¿Qué lista de pasos aplica según el estado del embudo?
function stepsForState(offer, state) {
  if (state === 'PAYMENT_PENDING' || state === 'UPSELL_PENDING') return paySteps(offer);
  return noReplySteps(offer);
}
// Arma el reloj de seguimiento (rama "no contestó") para una conversación
async function armMotorFollowup(convId, offer) {
  const steps = noReplySteps(offer);
  if (!steps.length) { await q('UPDATE conversations SET motor_fu_at=NULL WHERE id=$1', [convId]).catch(() => {}); return; }
  const mins = Math.max(1, Number(steps[0].after_min) || 30);
  await q("UPDATE conversations SET motor_fu_idx=0, motor_fu_at=now() + ($1 || ' minutes')::interval WHERE id=$2", [String(mins), convId]).catch(() => {});
}
// Arma el reloj de seguimiento (rama "abandonó el pago") para una conversación
async function armPayFollowup(convId, offer) {
  const steps = paySteps(offer);
  if (!steps.length) { await q('UPDATE conversations SET motor_fu_at=NULL WHERE id=$1', [convId]).catch(() => {}); return; }
  const mins = Math.max(1, Number(steps[0].after_min) || 30);
  await q("UPDATE conversations SET motor_fu_idx=0, motor_fu_at=now() + ($1 || ' minutes')::interval, abandon_branch='PAY' WHERE id=$2", [String(mins), convId]).catch(() => {});
}
// Scheduler: persigue a quien quedó en silencio — sea tras la secuencia ("no contestó")
// o tras recibir los datos de pago ("abandonó el pago"). Cada rama usa su propia lista de pasos.
async function runMotorFollowups() {
  const offers = await many('SELECT * FROM offer_config WHERE active=true').catch(() => []);
  for (const offer of offers) {
    const hasNoReply = noReplySteps(offer).length > 0;
    const hasPay = paySteps(offer).length > 0;
    if (!hasNoReply && !hasPay) continue;
    const ws = await one('SELECT * FROM workspaces WHERE id=$1', [offer.workspace_id]);
    if (!ws) continue;
    const rows = await many("SELECT id, wa_id, motor_fu_idx, funnel_state FROM conversations WHERE workspace_id=$1 AND (offer_id=$2 OR offer_id IS NULL) AND bot_active=true AND funnel_state IN ('AWAITING_INTEREST','REMARKETING','PAYMENT_PENDING','UPSELL_PENDING') AND motor_fu_at IS NOT NULL AND motor_fu_at<=now() LIMIT 60", [ws.id, offer.id]).catch(() => []);
    for (const c of rows) {
      const steps = stepsForState(offer, c.funnel_state);
      const idx = c.motor_fu_idx || 0;
      if (!steps.length || idx >= steps.length) { await q('UPDATE conversations SET motor_fu_at=NULL WHERE id=$1', [c.id]); continue; }
      const isPay = (c.funnel_state === 'PAYMENT_PENDING' || c.funnel_state === 'UPSELL_PENDING');
      const v = await offerVars(ws, offer, null);
      await sendFunnelText(ws, { id: c.id }, c.wa_id, fillVars(steps[idx].text, v));
      if (isPay && idx === 0) await addConvTags(c.id, [stageTag(offer, 'pago-abandonado')]).catch(() => {});
      const next = idx + 1;
      if (next >= steps.length) await q('UPDATE conversations SET motor_fu_idx=$1, motor_fu_at=NULL WHERE id=$2', [next, c.id]);
      else { const mins = Math.max(1, Number(steps[next].after_min) || 30); await q("UPDATE conversations SET motor_fu_idx=$1, motor_fu_at=now() + ($2 || ' minutes')::interval WHERE id=$3", [next, String(mins), c.id]); }
      await funnelEvent(ws, c.id, null, isPay ? 'motor.payfollowup.sent' : 'motor.followup.sent', { idx });
    }
  }
}
function defaultOfferMessages() {
  return {
    m1: 'MECÁNICOS, ATENCIÓN. 🔧\n\n¿Buscas una forma más rápida de conseguir manuales, información técnica y procedimientos de reparación para los vehículos que llegan a tu taller?\n\nTe presentamos el *PACK AUTOMOTRIZ PROFESIONAL*: +14.000 manuales de reparación, información eléctrica, diagramas y acceso digital para múltiples marcas y modelos.',
    m2_caption: '+14.000 MANUALES AUTOMOTRICES · PACK AUTOMOTRIZ PROFESIONAL',
    m3: 'OFERTA ESPECIAL DISPONIBLE AHORA.\n\nPrecio del Pack: *US${{main_usd}}*.\nEquivalente hoy: *{{main_ves}}* (tasa {{rate}}).\n\nPor US${{main_usd}} recibes el Pack + {{gift_count}} regalos sin costo adicional. 🎁',
    m4: 'POR TU COMPRA RECIBES ESTOS REGALOS:\n\n{{gifts_list}}\n\nValor total de regalos: *{{gifts_value}}*.',
    m5: '¿Quieres asegurar el *Pack Automotriz Profesional + los regalos* por *US${{main_usd}}*?\n\nResponde *SÍ* y te preparo el total para tu pedido. Si tienes una duda antes de pagar, pregúntame 🙌',
    bump_offer: 'Perfecto 🙌 Antes de pasarte el pago, una cosa más:\n\n¿Trabajas también con *MOTOS*? Por solo *+US${{bump_usd}}* agregas el *PACK MOTOS COMPLETO* (+2.500 manuales Honda/Yamaha/Bajaj/Suzuki, diagramas eléctricos, códigos de error y carburación).\n\n¿Lo agregamos? Responde *SÍ* o *NO*.',
    bump_yes: 'Excelente. Tu pedido queda:\n• Pack Automotriz + regalos\n• Pack Motos Completo\n\nTotal: *US${{usd_total}}* = *{{ves_total}}*.\n\nA continuación te paso los datos de pago 👇',
    bump_no: 'Perfecto, nos quedamos con tu *Pack Automotriz + los regalos*.\n\nTotal: *US${{usd_total}}* = *{{ves_total}}*.\n\nA continuación te paso los datos de pago 👇',
    payment: 'Para COMPRAR, realiza tu pago con estos datos:\n\n{{payment_details}}\n\n*Monto a pagar: {{ves_total}}* (US${{usd_total}} según la tasa del día).\n\nCuando pagues, envíame la *foto del comprobante* por aquí y te entrego todo al instante ✅',
    upsell_offer: 'Antes de enviarte todo, una oferta exclusiva solo para clientes: si trabajas con *camiones o maquinaria pesada*, agrega el *PACK CAMIONES + MAQUINARIA* por solo *+US${{upsell_usd}}* (Mercedes-Benz, Volvo, Scania, Iveco, MAN, Caterpillar, Komatsu, JCB, John Deere; sistemas hidráulicos; diagnóstico Diesel HD; códigos J1939).\n\n¿Lo agregas? Responde *SÍ* o *NO*.',
    upsell_yes: 'Perfecto. El adicional es *US${{upsell_usd}}* = *{{upsell_ves}}*.\n\nUsa los mismos datos de pago y envíame la captura de este segundo pago; te entrego todo junto 👇\n\n{{payment_details}}',
    downsell: 'Entiendo 🙌 Si prefieres empezar con menos, tenemos el *PACK AUTOMOTRIZ BÁSICO* por solo *US${{downsell_usd}}* = *{{downsell_ves}}*: los manuales más consultados + diagramas básicos. Cuando lo pruebes, puedes subir al Pro.\n\n¿Te lo preparo? Responde *SÍ* o *NO*.',
    sample: 'Claro, te mando una *muestra gratis*: los 10 códigos OBD2 más comunes + sus soluciones. Los revisas y luego decides 👇\n\n{{sample_link}}',
    delivery: '✅ *COMPRA CONFIRMADA.* Aquí tienes tu pedido:\n\n{{delivery_links}}\n\n¡Gracias por tu compra! 🙌 Si algún enlace no abre, escríbeme por aquí.',
  };
}
function offerMsg(offer, key) {
  const m = (offer && offer.messages && typeof offer.messages === 'object') ? offer.messages : {};
  const def = defaultOfferMessages();
  return (m[key] != null && String(m[key]).trim()) ? m[key] : def[key];
}
async function getRateSnapshot(ws) {
  const r = await one('SELECT fx FROM countries WHERE code=$1', [ws.country_code]);
  const fx = (r && Number(r.fx) > 0) ? Number(r.fx) : 1;
  return { rate: fx, ts: new Date() };
}
async function paymentDetailsText(ws, offer) {
  // Override de texto libre por flujo (ej. solo SPEI)
  if (offer && offer.payment_info && String(offer.payment_info).trim()) return String(offer.payment_info).trim();
  let methods = await many('SELECT id,label,type,detail FROM payment_methods WHERE workspace_id=$1 ORDER BY id', [ws.id]).catch(() => []);
  // Filtra a los métodos habilitados en este flujo (si el flujo eligió algunos)
  const ids = (offer && Array.isArray(offer.payment_method_ids)) ? offer.payment_method_ids.map(Number) : null;
  if (ids && ids.length) methods = methods.filter(m => ids.includes(Number(m.id)));
  if (methods && methods.length) return methods.map(m => (m.label ? ('*' + m.label + '*\n') : '') + m.detail).join('\n\n');
  const parts = [];
  if (ws.beneficiary_name) parts.push('Titular: ' + ws.beneficiary_name);
  if (ws.beneficiary_account) parts.push('Cuenta: ' + ws.beneficiary_account);
  return parts.length ? parts.join('\n') : '(configura tus datos de pago en la sección Pagos)';
}
// Convierte un precio del flujo a {usd, local} según la moneda elegida (USD con tasa, o directo en moneda local).
function priceAmounts(offer, priceNum, fx) {
  const p = Number(priceNum) || 0;
  if (offer && offer.price_currency === 'local') return { local: Math.round(p), usd: fx > 0 ? Math.round((p / fx) * 100) / 100 : p };
  return { usd: p, local: Math.round(p * (fx || 1)) };
}
async function offerVars(ws, offer, order) {
  const rate = (order && order.rate_value) ? Number(order.rate_value) : (await getRateSnapshot(ws)).rate;
  const gifts = Array.isArray(offer.gifts) ? offer.gifts : [];
  const giftsValue = gifts.reduce((a, g) => a + (Number(g.ref_value) || 0), 0);
  const main = priceAmounts(offer, offer.main_usd, rate), bump = priceAmounts(offer, offer.bump_usd, rate), upsell = priceAmounts(offer, offer.upsell_usd, rate), downsell = priceAmounts(offer, offer.downsell_usd, rate);
  const usdTotal = order ? Number(order.usd_total) : main.usd;
  const vesTotal = order ? Number(order.ves_total) : main.local;
  return {
    main_usd: main.usd, bump_usd: bump.usd, upsell_usd: upsell.usd, downsell_usd: downsell.usd,
    main_ves: fmtLocal(ws, main.local), usd_total: usdTotal, ves_total: fmtLocal(ws, vesTotal),
    upsell_ves: fmtLocal(ws, upsell.local), downsell_ves: fmtLocal(ws, downsell.local),
    // Aliases en moneda local (para no depender del nombre "ves"): {{total}}, {{main_price}}, etc.
    total: fmtLocal(ws, vesTotal), main_price: fmtLocal(ws, main.local), bump_price: fmtLocal(ws, bump.local), upsell_price: fmtLocal(ws, upsell.local), downsell_price: fmtLocal(ws, downsell.local),
    rate: (Math.round(rate * 100) / 100).toLocaleString('es-ES') + ' ' + (ws.currency || '') + '/USD',
    gift_count: gifts.length,
    gifts_list: gifts.length ? gifts.map(g => '🎁 ' + g.name + (g.ref_value ? (' — valor US$' + g.ref_value + ', hoy GRATIS') : '')).join('\n') : '',
    gifts_value: 'US$' + giftsValue,
    payment_details: await paymentDetailsText(ws, offer),
    sample_link: (offer.sample && offer.sample.delivery_url) || '',
  };
}
async function setFunnel(convId, s) { await q('UPDATE conversations SET funnel_state=$1, funnel_step_at=now() WHERE id=$2', [s, convId]); }
// Etiquetas (como GHL): la IA/motor las pone y quitan solas; alimentan segmentos y decisiones.
async function addConvTags(convId, tags) {
  if (!tags || !tags.length) return;
  const row = await one('SELECT tags FROM conversations WHERE id=$1', [convId]);
  const cur = (row && Array.isArray(row.tags)) ? row.tags.map(String) : [];
  const set = new Set(cur);
  tags.forEach(t => { const v = String(t).trim().toLowerCase(); if (v) set.add(v); });
  await q('UPDATE conversations SET tags=$1 WHERE id=$2', [JSON.stringify([...set]), convId]).catch(() => {});
}
async function removeConvTags(convId, tags) {
  const row = await one('SELECT tags FROM conversations WHERE id=$1', [convId]);
  const cur = (row && Array.isArray(row.tags)) ? row.tags.map(String) : [];
  const rm = new Set((tags || []).map(t => String(t).trim().toLowerCase()));
  await q('UPDATE conversations SET tags=$1 WHERE id=$2', [JSON.stringify(cur.filter(t => !rm.has(t.toLowerCase()))), convId]).catch(() => {});
}
async function funnelEvent(ws, convId, orderId, event, meta) { await q('INSERT INTO funnel_events (workspace_id,conversation_id,order_id,event,meta) VALUES ($1,$2,$3,$4,$5)', [ws.id, convId, orderId || null, event, JSON.stringify(meta || {})]).catch(() => {}); }
async function sendFunnelText(ws, conv, from, text) {
  if (!text) return;
  await sendWa(ws, from, { type: 'text', text: { body: text, preview_url: true } });
  await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, text]);
  await q('UPDATE conversations SET last_message=$1, last_at=now() WHERE id=$2', [text.slice(0, 120), conv.id]);
}
async function sendFunnelButtons(ws, conv, from, text, buttons) {
  const ok = await sendWa(ws, from, waButtonsPayload(text, buttons));
  if (!ok) return await sendFunnelText(ws, conv, from, text);
  await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, text]);
  await q('UPDATE conversations SET last_message=$1, last_at=now() WHERE id=$2', [text.slice(0, 120), conv.id]);
}
// Envía un mensaje del guion: si tiene imagen adjunta (key_image_url) va como imagen con caption; si no, texto.
async function sendKey(ws, conv, from, offer, key, v) {
  const text = fillVars(offerMsg(offer, key), v);
  const img = imgFor(offer, key);
  if (img) {
    await sendWaImageOrdered(ws, from, img, text);
    await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'image')", [conv.id, '🖼️ ' + text.slice(0, 80)]);
    await q('UPDATE conversations SET last_message=$1, last_at=now() WHERE id=$2', [text.slice(0, 120), conv.id]);
  } else await sendFunnelText(ws, conv, from, text);
}
// Igual pero con botones: si hay imagen, va la imagen primero, luego los botones con el texto.
async function sendKeyButtons(ws, conv, from, offer, key, v, buttons) {
  const img = imgFor(offer, key);
  if (img) {
    await sendWaImageOrdered(ws, from, img, null);
    await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'image')", [conv.id, '🖼️ imagen']);
    await funnelSleep(paceMs(offer) + 1500);
  }
  await sendFunnelButtons(ws, conv, from, fillVars(offerMsg(offer, key), v), buttons);
}
async function ensureOrder(ws, conv, offer) {
  if (conv.order_id) { const o = await one('SELECT * FROM orders WHERE id=$1', [conv.order_id]); if (o) return o; }
  const snap = await getRateSnapshot(ws);
  const a = priceAmounts(offer, offer.main_usd, snap.rate);
  const o = await one('INSERT INTO orders (workspace_id,conversation_id,skus,usd_total,ves_total,rate_value,rate_timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [ws.id, conv.id, JSON.stringify([{ sku: 'AUTO_PRO', usd: a.usd }]), a.usd, a.local, snap.rate, snap.ts]);
  await q('UPDATE conversations SET order_id=$1 WHERE id=$2', [o.id, conv.id]);
  conv.order_id = o.id;
  await funnelEvent(ws, conv.id, o.id, 'lead.created');
  return o;
}
async function recalcOrder(ws, offer, order) {
  const snap = await getRateSnapshot(ws);
  const parts = [priceAmounts(offer, offer.main_usd, snap.rate)];
  const skus = [{ sku: 'AUTO_PRO', usd: parts[0].usd }];
  if (order.bump_status === 'accepted') { const b = priceAmounts(offer, offer.bump_usd, snap.rate); skus.push({ sku: 'MOTOS', usd: b.usd }); parts.push(b); }
  if (order.upsell_status === 'accepted') { const u = priceAmounts(offer, offer.upsell_usd, snap.rate); skus.push({ sku: 'CAMIONES', usd: u.usd }); parts.push(u); }
  const usd = Math.round(parts.reduce((a, p) => a + p.usd, 0) * 100) / 100;
  const ves = parts.reduce((a, p) => a + p.local, 0);
  await q('UPDATE orders SET skus=$1, usd_total=$2, ves_total=$3, rate_value=$4, rate_timestamp=$5 WHERE id=$6',
    [JSON.stringify(skus), usd, ves, snap.rate, snap.ts, order.id]);
  return await one('SELECT * FROM orders WHERE id=$1', [order.id]);
}
// Clasifica la intención del último mensaje (atajos por texto + IA de respaldo)
async function classifyIntent(ws, history, lastMsg) {
  const t = normText(lastMsg || '');
  if (/\b(stop|no me escribas|no escribir|no molestes|dejame en paz|no quiero saber)\b/.test(t)) return 'OPTOUT';
  if (/(donde|como|a que|numero|cuenta|a quien).{0,15}(pago|paga|transfer|deposit|deposito)|datos de pago|donde deposito|como compro/.test(t)) return 'DONDE_PAGO';
  if (/(caro|carisimo|muy caro|no tengo (plata|dinero|efectivo)|esta caro|mas barato|descuento|es mucho|no me alcanza|parece estafa|es estafa)/.test(t)) return 'OBJECION_PRECIO';
  if (/(gratis|una muestra|prueba gratis|mandame algo|algo free|de prueba)/.test(t)) return 'PRUEBA_GRATIS';
  if (t.length < 32) {
    if (/^(no|nel|nop|no gracias|ahora no|luego|despues|todavia no|paso)\b/.test(t) || /\bno\b.*\b(quiero|gracias|por ahora)\b/.test(t)) return 'NO';
    if (/^(si+|sii+|dale|listo|va|ok|okey|okay|correcto|asi es|claro|de una|lo quiero|quiero|obvio|perfecto|agregalo|si porfa|si por favor)\b/.test(t) || /\bsi\b/.test(t)) return 'SI';
  }
  const key = await getSetting('anthropic_key'), okey = await getSetting('openai_key');
  if (!key && !okey) return 'OTRO';
  const sys = 'Clasifica el ÚLTIMO mensaje del cliente en UNA etiqueta. Responde SOLO JSON {"intent":"X"}. Etiquetas: SI (acepta/quiere/confirma/da el ok), NO (rechaza/no por ahora), DONDE_PAGO (pregunta cómo o dónde pagar, pide los datos de pago o dice que quiere comprar ya), OBJECION_PRECIO (dice que está caro o que no tiene dinero), PRUEBA_GRATIS (pide algo gratis o una muestra), OPTOUT (pide que no le escriban más), PREGUNTA (pregunta técnica: sirve para mi carro, cobertura, si funciona en su equipo, etc.), OTRO. Considera jerga latinoamericana, errores de ortografía y notas de voz transcritas.';
  const out = await chatComplete(sys, [{ role: 'user', content: 'Historial reciente:\n' + String(history || '').slice(-700) + '\n\nÚltimo mensaje del cliente: "' + lastMsg + '"' }], 60).catch(() => ({}));
  const j = extractJson(out && out.text || '');
  const v = j && j.intent ? String(j.intent).toUpperCase() : 'OTRO';
  return ['SI', 'NO', 'DONDE_PAGO', 'OBJECION_PRECIO', 'PRUEBA_GRATIS', 'OPTOUT', 'PREGUNTA', 'OTRO'].includes(v) ? v : 'OTRO';
}
// Envía la secuencia principal de 5 mensajes y queda esperando intención
async function sendMainSequence(ws, conv, from, offer) {
  const order = await ensureOrder(ws, conv, offer);
  const v = await offerVars(ws, offer, order);
  const pace = paceMs(offer);
  const imgWait = pace + 800; // la imagen se sube antes y se manda por id (orden garantizado); solo un respiro natural
  // Mensaje 1 con variantes A/B (rota por id de conversación) + imagen opcional
  const variants = (offer.messages && Array.isArray(offer.messages.m1_variants)) ? offer.messages.m1_variants.filter(x => x && String(x).trim()) : [];
  const m1all = [offerMsg(offer, 'm1'), ...variants];
  const m1text = fillVars(m1all[conv.id % m1all.length], v);
  const m1img = imgFor(offer, 'm1');
  if (m1img) { await sendWaImageOrdered(ws, from, m1img, m1text); await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'image')", [conv.id, '🖼️ ' + m1text.slice(0, 80)]); await funnelSleep(imgWait); }
  else { await sendFunnelText(ws, conv, from, m1text); await funnelSleep(pace); }
  // Mensaje 2 · imagen dedicada del pack
  const img = offer.messages && offer.messages.m2_image_url;
  if (img) {
    await sendWaImageOrdered(ws, from, img, fillVars(offerMsg(offer, 'm2_caption'), v));
    await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'image')", [conv.id, '🖼️ ' + fillVars(offerMsg(offer, 'm2_caption'), v)]);
    await funnelSleep(imgWait);
  }
  await sendKey(ws, conv, from, offer, 'm3', v);
  await funnelSleep(imgFor(offer, 'm3') ? imgWait : pace);
  // Envía el mensaje de regalos si hay lista de regalos, O una imagen de regalos, O un texto de regalos escrito.
  const m4has = (Array.isArray(offer.gifts) && offer.gifts.length) || imgFor(offer, 'm4') || (offer.messages && offer.messages.m4 && String(offer.messages.m4).trim());
  if (m4has) {
    await sendKey(ws, conv, from, offer, 'm4', v);
    await funnelSleep(imgFor(offer, 'm4') ? imgWait : pace);
  }
  await sendKeyButtons(ws, conv, from, offer, 'm5', v, [{ id: 'FUNNEL_SI', title: 'SÍ, lo quiero' }, { id: 'FUNNEL_NO', title: 'Ahora no' }]);
  // Solo pasa a "esperando interés" si sigue en envío (no pisa un estado que el cliente ya avanzó con una respuesta rápida).
  await q("UPDATE conversations SET funnel_state='AWAITING_INTEREST', funnel_step_at=now() WHERE id=$1 AND funnel_state='MAIN_SENDING'", [conv.id]);
  await funnelEvent(ws, conv.id, order.id, 'main_flow.sent');
  await armMotorFollowup(conv.id, offer); // arranca el reloj de "no contestó"
}
async function offerBump(ws, conv, from, offer, order) {
  const v = await offerVars(ws, offer, order);
  if (offer.bump_product_id && Number(offer.bump_usd) > 0) {
    await q("UPDATE orders SET bump_status='offered' WHERE id=$1", [order.id]);
    await sendKeyButtons(ws, conv, from, offer, 'bump_offer', v, [{ id: 'BUMP_SI', title: 'SÍ, agregar' }, { id: 'BUMP_NO', title: 'No, gracias' }]);
    await setFunnel(conv.id, 'BUMP_OFFERED');
    await funnelEvent(ws, conv.id, order.id, 'bump.motos.offered');
  } else {
    await sendBumpConfirmAndPay(ws, conv, from, offer, order, 'bump_no');
  }
}
async function sendBumpConfirmAndPay(ws, conv, from, offer, order, whichMsg) {
  order = await one('SELECT * FROM orders WHERE id=$1', [order.id]);
  const v = await offerVars(ws, offer, order);
  await sendKey(ws, conv, from, offer, whichMsg, v);
  await funnelSleep(paceMs(offer));
  await sendKey(ws, conv, from, offer, 'payment', v);
  await setFunnel(conv.id, 'PAYMENT_PENDING');
  await armPayFollowup(conv.id, offer); // arranca el reloj de "abandonó el pago"
  await funnelEvent(ws, conv.id, order.id, 'payment.instructions.sent');
}
async function resendPayment(ws, conv, from, offer, order) {
  const v = await offerVars(ws, offer, order);
  await sendKey(ws, conv, from, offer, 'payment', v);
}
async function offerDownsell(ws, conv, from, offer, lastMsg) {
  if (!offer.downsell_product_id || !(Number(offer.downsell_usd) > 0)) { await answerQuestion(ws, conv, from, offer, lastMsg); return; }
  const v = await offerVars(ws, offer, null);
  await sendKeyButtons(ws, conv, from, offer, 'downsell', v, [{ id: 'DS_SI', title: 'Sí, el Básico' }, { id: 'DS_NO', title: 'No' }]);
  await setFunnel(conv.id, 'PRICE_OBJECTION');
  await funnelEvent(ws, conv.id, null, 'downsell.offered');
  await addConvTags(conv.id, [stageTag(offer, 'objecion')]);
}
async function sendSample(ws, conv, from, offer) {
  const s = offer.sample || {};
  if (!s.enabled && !s.delivery_url) { await answerQuestion(ws, conv, from, offer); return; }
  const v = await offerVars(ws, offer, null);
  await sendKey(ws, conv, from, offer, 'sample', v);
  await funnelEvent(ws, conv.id, null, 'sample.sent');
  await addConvTags(conv.id, [stageTag(offer, 'gratis')]);
}
async function sendUpsellPay(ws, conv, from, offer, order) {
  const v = await offerVars(ws, offer, order);
  await sendKey(ws, conv, from, offer, 'upsell_yes', v);
  await setFunnel(conv.id, 'UPSELL_PENDING');
  await armPayFollowup(conv.id, offer); // reloj de "abandonó el pago" también en el upsell
  await funnelEvent(ws, conv.id, order.id, 'upsell.payment.sent');
}
// Responde una duda con la IA (con guardarraíles) SIN cambiar el estado del embudo
async function answerQuestion(ws, conv, from, offer, lastMsg, extra) {
  const rows = await many('SELECT direction, body FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 16', [conv.id]);
  const msgs = toClaudeMessages(rows.reverse());
  let sys = await buildSalesSystem(ws, null);
  sys += '\n\nREGLAS DEL MOTOR DE VENTA: No inventes precios, cobertura, licencias ni links; si no está en la configuración, no lo prometas. Responde corto y claro. Si el cliente muestra interés en comprar, dile que responda *SÍ* para prepararle el pedido. ' + (extra || '');
  const out = await chatComplete(sys, msgs.length ? msgs : [{ role: 'user', content: lastMsg || 'Hola' }]);
  if (out && out.text) await sendFunnelText(ws, conv, from, out.text);
}
// Entrega SOLO los SKUs pagados + regalos
async function deliverOrder(ws, conv, from, offer, order) {
  order = order || (conv.order_id ? await one('SELECT * FROM orders WHERE id=$1', [conv.order_id]) : null);
  const skus = (order && Array.isArray(order.skus)) ? order.skus.map(s => s.sku) : ['AUTO_PRO'];
  const links = [];
  const linkFor = async (pid, label) => { if (!pid) return; const p = await one('SELECT name,delivery_url FROM products WHERE id=$1', [pid]); if (p && p.delivery_url) links.push('• ' + (p.name || label) + ': ' + p.delivery_url); };
  if (skus.includes('BASICO')) await linkFor(offer.downsell_product_id, 'Pack Básico');
  else await linkFor(offer.main_product_id, 'Pack Automotriz');
  (Array.isArray(offer.gifts) ? offer.gifts : []).forEach(g => { if (g.delivery_url) links.push('🎁 ' + g.name + ': ' + g.delivery_url); });
  if (skus.includes('MOTOS')) await linkFor(offer.bump_product_id, 'Pack Motos');
  if (skus.includes('CAMIONES')) await linkFor(offer.upsell_product_id, 'Pack Camiones + Maquinaria');
  const v = await offerVars(ws, offer, order);
  v.delivery_links = links.length ? links.join('\n') : '(configura los links de entrega en la sección Ofertas)';
  await sendKey(ws, conv, from, offer, 'delivery', v);
  if (order) await q("UPDATE orders SET delivered_at=now() WHERE id=$1", [order.id]);
  await setFunnel(conv.id, 'DELIVERED');
  await q("UPDATE conversations SET stage='cliente' WHERE id=$1", [conv.id]);
  await funnelEvent(ws, conv.id, order ? order.id : null, 'delivery.sent');
  await addConvTags(conv.id, [stageTag(offer, 'entregado')]);
}
// Motor principal: recibe un mensaje de texto/botón y avanza la máquina de estados.
// Devuelve true si el motor se hizo cargo; false para dejar pasar a flujos/agente.
async function runFunnel(ws, conv, from, body) {
  const c = await one('SELECT id, funnel_state, order_id, ctwa_clid, offer_id FROM conversations WHERE id=$1', [conv.id]);
  const state = (c && c.funnel_state) || 'NEW_LEAD';
  const convO = { id: conv.id, order_id: c && c.order_id };
  let offer;
  if (state === 'NEW_LEAD') {
    offer = await pickOffer(ws, c && c.ctwa_clid, body); // elige el flujo cuyo disparador aplica
    if (!offer) return false; // ningún flujo Power aplica -> flujos/agente normal
    // CANDADO ATÓMICO: solo UNA ejecución arranca el guion. Evita que un webhook duplicado
    // (WhatsApp a veces lo reenvía) dispare la secuencia dos veces y llegue desordenada/repetida.
    const lock = await one("UPDATE conversations SET funnel_state='MAIN_SENDING', offer_id=$1 WHERE id=$2 AND (funnel_state IS NULL OR funnel_state='NEW_LEAD') RETURNING id", [offer.id, conv.id]);
    if (!lock) return true; // otra ejecución ya tomó este lead
    const ptag = productTagOf(offer); // etiqueta de producto en toda conversación de este flujo
    if (ptag) await addConvTags(conv.id, [ptag]);
    await sendMainSequence(ws, convO, from, offer); return true;
  }
  offer = await getConvOffer(ws, c && c.offer_id); // conversación ya asignada a un flujo
  if (!offer) return false;
  // El cliente respondió: pausa el reloj de seguimiento (no lo molestamos mientras conversa)
  await q('UPDATE conversations SET motor_fu_at=NULL WHERE id=$1', [conv.id]).catch(() => {});
  if (state === 'DELIVERED' || state === 'OPT_OUT') return false; // cerrado: que atienda el agente normal
  const rows = await many('SELECT direction, body FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 14', [conv.id]);
  const history = rows.reverse().map(r => (r.direction === 'in' ? 'Cliente: ' : 'Bot: ') + (r.body || '')).join('\n');
  const intent = await classifyIntent(ws, history, body);
  if (intent === 'OPTOUT') { await setFunnel(conv.id, 'OPT_OUT'); await q('UPDATE conversations SET followup_at=NULL WHERE id=$1', [conv.id]); await funnelEvent(ws, conv.id, convO.order_id, 'optout.received'); await addConvTags(conv.id, [stageTag(offer, 'nomolestar')]); return true; }
  let order = convO.order_id ? await one('SELECT * FROM orders WHERE id=$1', [convO.order_id]) : null;
  switch (state) {
    case 'MAIN_SENDING':
    case 'AWAITING_INTEREST':
    case 'REMARKETING': {
      if (intent === 'SI' || intent === 'DONDE_PAGO') { order = await ensureOrder(ws, convO, offer); await funnelEvent(ws, conv.id, order.id, 'interest.confirmed'); await addConvTags(conv.id, [stageTag(offer, 'interesado')]); await offerBump(ws, convO, from, offer, order); }
      else if (intent === 'OBJECION_PRECIO') await offerDownsell(ws, convO, from, offer, body);
      else if (intent === 'PRUEBA_GRATIS') await sendSample(ws, convO, from, offer);
      else if (intent === 'NO') { await setFunnel(conv.id, 'REMARKETING'); await q("UPDATE conversations SET abandon_branch=COALESCE(abandon_branch,'A') WHERE id=$1", [conv.id]); await armMotorFollowup(conv.id, offer); await answerQuestion(ws, convO, from, offer, body, 'El cliente dijo que ahora no. Sé breve y amable, deja la puerta abierta sin presionar.'); }
      else await answerQuestion(ws, convO, from, offer, body);
      return true;
    }
    case 'BUMP_OFFERED': {
      if (!order) order = await ensureOrder(ws, convO, offer);
      if (intent === 'SI') { await q("UPDATE orders SET bump_status='accepted' WHERE id=$1", [order.id]); order = await recalcOrder(ws, offer, { ...order, bump_status: 'accepted' }); await funnelEvent(ws, conv.id, order.id, 'bump.motos.accepted'); await addConvTags(conv.id, [stageTag(offer, 'bump')]); await sendBumpConfirmAndPay(ws, convO, from, offer, order, 'bump_yes'); }
      else if (intent === 'NO' || intent === 'DONDE_PAGO') { await q("UPDATE orders SET bump_status=$2 WHERE id=$1", [order.id, intent === 'NO' ? 'declined' : 'skipped']); await funnelEvent(ws, conv.id, order.id, 'bump.motos.declined'); await sendBumpConfirmAndPay(ws, convO, from, offer, order, 'bump_no'); }
      else if (intent === 'OBJECION_PRECIO') await offerDownsell(ws, convO, from, offer, body);
      else await answerQuestion(ws, convO, from, offer, body, 'Le ofreciste el Pack Motos por +US$' + (Number(offer.bump_usd) || 0) + '. Resuelve su duda y pregúntale de nuevo si lo agrega (SÍ/NO).');
      return true;
    }
    case 'PAYMENT_PENDING': {
      if (intent === 'DONDE_PAGO') { order = order || await ensureOrder(ws, convO, offer); await resendPayment(ws, convO, from, offer, order); }
      else await answerQuestion(ws, convO, from, offer, body, 'El cliente está por pagar. Si dice que ya pagó, pídele con amabilidad la *foto del comprobante* (no confirmes el pago sin comprobante).');
      return true;
    }
    case 'UPSELL_OFFERED': {
      if (!order) order = await ensureOrder(ws, convO, offer);
      if (intent === 'SI') { order = await recalcOrder(ws, offer, { ...order, upsell_status: 'accepted' }); await q("UPDATE orders SET upsell_status='accepted' WHERE id=$1", [order.id]); await funnelEvent(ws, conv.id, order.id, 'upsell.camiones.accepted'); await addConvTags(conv.id, [stageTag(offer, 'upsell')]); await sendUpsellPay(ws, convO, from, offer, order); }
      else { await q("UPDATE orders SET upsell_status='declined' WHERE id=$1", [order.id]); await funnelEvent(ws, conv.id, order.id, 'upsell.camiones.declined'); await deliverOrder(ws, convO, from, offer, order); }
      return true;
    }
    case 'UPSELL_PENDING': {
      if (intent === 'DONDE_PAGO') await resendPayment(ws, convO, from, offer, order);
      else await answerQuestion(ws, convO, from, offer, body, 'El cliente está pagando el upsell de Camiones. Si dice que ya pagó, pídele la captura del segundo pago.');
      return true;
    }
    case 'PRICE_OBJECTION': {
      if (intent === 'SI') {
        order = await ensureOrder(ws, convO, offer);
        const snap = await getRateSnapshot(ws); const dp = priceAmounts(offer, offer.downsell_usd, snap.rate);
        await q('UPDATE orders SET skus=$2, usd_total=$3, ves_total=$4, rate_value=$5, rate_timestamp=$6 WHERE id=$1', [order.id, JSON.stringify([{ sku: 'BASICO', usd: dp.usd }]), dp.usd, dp.local, snap.rate, snap.ts]);
        order = await one('SELECT * FROM orders WHERE id=$1', [order.id]);
        await funnelEvent(ws, conv.id, order.id, 'downsell.accepted');
        await sendBumpConfirmAndPay(ws, convO, from, offer, order, 'bump_no');
      } else if (intent === 'PRUEBA_GRATIS') await sendSample(ws, convO, from, offer);
      else await answerQuestion(ws, convO, from, offer, body);
      return true;
    }
    default:
      return false;
  }
}

// Decide quién responde: primero el MOTOR de venta (si la Oferta está activa),
// luego los flujos manuales; si nada aplica, el agente IA con memoria.
async function handleBotResponse(ws, conv, from, body) {
  try { if (await runFunnel(ws, conv, from, body)) return; } catch (e) { console.error('funnel error', e.message); }
  const handled = await runFlows(ws, conv, from, body);
  if (handled) return;
  await agentAutoReply(ws, conv, from);
}

// ---------- Alertas inteligentes + Telegram ----------
async function productAdsBreakdown(userId) {
  const workspaces = await many('SELECT * FROM workspaces WHERE user_id=$1', [userId]);
  const prodMap = {};
  for (const w of workspaces) {
    const c = await one('SELECT fx FROM countries WHERE code=$1', [w.country_code]);
    const fx = (c && c.fx) || 1;
    const sbp = await many('SELECT product_name, COALESCE(SUM(amount),0)::float8 s, COUNT(*)::int u FROM sales WHERE workspace_id=$1 GROUP BY product_name', [w.id]);
    sbp.forEach(s => { prodMap[s.product_name] = prodMap[s.product_name] || { revenue: 0, spend: 0, unidades: 0 }; prodMap[s.product_name].revenue += s.s / fx; prodMap[s.product_name].unidades += s.u; });
  }
  const codes = workspaces.map(w => w.country_code);
  const spendByProd = await many('SELECT product, COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code = ANY($1::text[]) AND product IS NOT NULL GROUP BY product', [codes]);
  spendByProd.forEach(x => { prodMap[x.product] = prodMap[x.product] || { revenue: 0, spend: 0, unidades: 0 }; prodMap[x.product].spend += x.s; });
  return Object.entries(prodMap).map(([name, v]) => ({ product: name, revenue: v.revenue, spend: v.spend, unidades: v.unidades, roas: v.spend > 0 ? v.revenue / v.spend : null }))
    .filter(p => p.spend > 0 || p.revenue > 0).sort((a, b) => b.spend - a.spend);
}
const money2 = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function computeAlerts(userId) {
  const alerts = [];
  const fin = await computeFinanceForUser(userId);
  for (const r of fin.rows) {
    if (r.revenue === 0 && r.spend === 0) continue;
    if (r.neto < 0) alerts.push({ level: 'pausar', icon: '⛔', title: 'Pérdida en ' + r.name, detail: 'NETO negativo (' + money2(r.neto) + '). Reduce gasto o revisa el embudo.' });
    else if (r.estado === 'Escalar') alerts.push({ level: 'escalar', icon: '🚀', title: 'Escala ' + r.name, detail: 'ROAS ' + r.roas.toFixed(2) + ' y NETO positivo. Sube el presupuesto.' });
    else if (r.estado === 'Pausar') alerts.push({ level: 'pausar', icon: '⏸️', title: 'Pausa/reduce ' + r.name, detail: 'ROAS bajo (' + (r.roas ? r.roas.toFixed(2) : '—') + '). Estás cerca de perder.' });
    else if (r.estado === 'Mantener') alerts.push({ level: 'revisar', icon: '👀', title: 'Vigila ' + r.name, detail: 'ROAS ' + r.roas.toFixed(2) + ' (mantener). Optimiza para escalar.' });
  }
  const byProduct = await productAdsBreakdown(userId);
  for (const p of byProduct) {
    if (p.spend <= 0) continue;
    if (p.roas != null && p.roas > 2) alerts.push({ level: 'escalar', icon: '🚀', title: 'Escala producto: ' + p.product, detail: 'ROAS ' + p.roas.toFixed(2) + '. Rentable — mete más presupuesto.' });
    else if (p.roas != null && p.roas >= 1.5) alerts.push({ level: 'revisar', icon: '👀', title: 'Revisa producto: ' + p.product, detail: 'ROAS ' + p.roas.toFixed(2) + '. Margen justo, optimiza creativos.' });
    else alerts.push({ level: 'pausar', icon: '⏸️', title: 'Reduce/pausa producto: ' + p.product, detail: 'ROAS ' + (p.roas ? p.roas.toFixed(2) : '—') + '. No es rentable ahora.' });
  }
  const order = { pausar: 0, escalar: 1, revisar: 2, info: 3 };
  alerts.sort((a, b) => (order[a.level] - order[b.level]));
  return alerts;
}

app.get('/api/alerts', auth(async (req, res) => {
  const alerts = await computeAlerts(req.accountId);
  const tgChat = (await getSetting('tg_chat')) || '';
  res.json({ alerts, telegramConfigured: !!(await getSetting('tg_token')) && !!tgChat, tgChat });
}));
app.get('/api/user/telegram', auth(async (req, res) => {
  res.json({ configured: !!(await getSetting('tg_token')) && !!(await getSetting('tg_chat')), chat_id: (await getSetting('tg_chat')) || '' });
}));
app.post('/api/user/telegram', auth(async (req, res) => {
  const { bot_token, chat_id } = req.body || {};
  if (bot_token) await setSetting('tg_token', bot_token);
  if (chat_id != null) await setSetting('tg_chat', chat_id);
  res.json({ ok: true });
}));
app.post('/api/alerts/send-telegram', auth(async (req, res) => {
  const token = await getSetting('tg_token'); const chat = await getSetting('tg_chat');
  if (!token || !chat) return res.status(400).json({ error: 'Configura Telegram primero (bot token + chat id).' });
  const alerts = await computeAlerts(req.accountId);
  const text = '🔔 *Alertas PDFmania*\n\n' + (alerts.length ? alerts.map(a => a.icon + ' *' + a.title + '*\n' + a.detail).join('\n\n') : 'Todo en orden ✅');
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }),
    });
    const d = await r.json();
    if (!d.ok) return res.status(400).json({ error: d.description || 'Error de Telegram' });
    res.json({ ok: true, sent: alerts.length });
  } catch (e) { res.status(502).json({ error: 'No se pudo contactar Telegram' }); }
}));

// ---------- Remarketing (segmentos + campañas) ----------
const SEGMENTS = {
  interesados: { label: 'Interesados (sin compra)', where: "NOT EXISTS(SELECT 1 FROM receipts r WHERE r.conversation_id=c.id AND r.status='valido')" },
  revision: { label: 'Comprobante en revisión', where: "EXISTS(SELECT 1 FROM receipts r WHERE r.conversation_id=c.id AND r.status IN ('sospechoso','duplicado','rechazado')) AND NOT EXISTS(SELECT 1 FROM receipts r2 WHERE r2.conversation_id=c.id AND r2.status='valido')" },
  clientes: { label: 'Clientes (ya compraron)', where: "EXISTS(SELECT 1 FROM receipts r WHERE r.conversation_id=c.id AND r.status='valido')" },
  inactivos: { label: 'Inactivos +7 días', where: "c.last_at < now()-interval '7 days'" },
};
async function segmentRecipients(wsId, key) {
  const seg = SEGMENTS[key]; if (!seg) return [];
  return many(`SELECT c.id, c.wa_id, c.name FROM conversations c WHERE c.workspace_id=$1 AND (${seg.where})`, [wsId]);
}
app.get('/api/remarketing/segments', auth(async (req, res) => {
  const out = [];
  for (const [key, seg] of Object.entries(SEGMENTS)) {
    const r = await one(`SELECT COUNT(*)::int c FROM conversations c WHERE c.workspace_id=$1 AND (${seg.where})`, [req.workspace.id]);
    out.push({ key, label: seg.label, count: r.c });
  }
  res.json({ segments: out });
}));
app.get('/api/remarketing', auth(async (req, res) => {
  const list = await many('SELECT * FROM remarketing WHERE workspace_id=$1 ORDER BY id DESC LIMIT 100', [req.workspace.id]);
  res.json({ campaigns: list, segmentLabels: Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, v.label])) });
}));
app.post('/api/remarketing', auth(async (req, res) => {
  const { name, segment, message } = req.body || {};
  if (!segment || !message) return res.status(400).json({ error: 'Segmento y mensaje requeridos' });
  const recipients = await segmentRecipients(req.workspace.id, segment);
  let sent = 0;
  for (const rc of recipients) {
    try { await sendWa(req.workspace, rc.wa_id, { type: 'text', text: { body: message } }); } catch (e) {}
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [rc.id, message]).catch(() => {});
    await q('UPDATE conversations SET last_message=$1, last_at=now() WHERE id=$2', [message, rc.id]).catch(() => {});
    sent++;
  }
  const camp = await one('INSERT INTO remarketing (workspace_id,name,segment,message,sent) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.workspace.id, name || 'Campaña', segment, message, sent]);
  res.json({ id: camp.id, sent, recipients: recipients.length });
}));

// ---------- Seguimiento (follow-up dentro de 24h) · POR PRODUCTO ----------
function sanitizeFollowupSteps(arr) {
  const ok = ['message', 'image', 'audio', 'video', 'document', 'ai'];
  return (Array.isArray(arr) ? arr : []).map(s => {
    const type = ok.includes(s.type) ? s.type : 'message';
    return {
      after_min: Math.max(1, Math.min(1440, parseInt(s.after_min, 10) || 30)),
      type,
      text: String(s.text || '').slice(0, 1024),
      url: String(s.url || '').trim().slice(0, 500),
      filename: String(s.filename || '').slice(0, 120),
      prompt: String(s.prompt || '').slice(0, 800),
      buttons: Array.isArray(s.buttons) ? s.buttons.map(x => String(x || '').trim()).filter(Boolean).slice(0, 3) : [],
    };
  }).filter(s => s.text || s.url || s.prompt).slice(0, 10);
}
async function loadFollowup(wsId, productId) {
  return await one('SELECT * FROM followups WHERE workspace_id=$1 AND product_id IS NOT DISTINCT FROM $2 ORDER BY id LIMIT 1', [wsId, productId]);
}
app.get('/api/followup', auth(async (req, res) => {
  const ws = req.workspace;
  const productId = (req.query.product_id && req.query.product_id !== 'general') ? parseInt(req.query.product_id, 10) : null;
  const row = await loadFollowup(ws.id, productId);
  let steps = [];
  if (row) { try { steps = Array.isArray(row.steps) ? row.steps : JSON.parse(row.steps || '[]'); } catch (e) { steps = []; } }
  const products = await many('SELECT id, name, price FROM products WHERE workspace_id=$1 ORDER BY id', [ws.id]);
  const st = await one("SELECT COUNT(*)::int c FROM conversations WHERE workspace_id=$1 AND bot_active=true AND COALESCE(stage,'')<>'cliente' AND product_id IS NOT DISTINCT FROM $2 AND last_in_at > now() - interval '24 hours'", [ws.id, productId]);
  res.json({ on: row ? row.active === true : false, steps, products, product_id: productId, active_convos: (st && st.c) || 0, workspace_name: ws.name, flag: ws.flag, currency: ws.currency });
}));
app.post('/api/followup', auth(async (req, res) => {
  const ws = req.workspace;
  const b = req.body || {};
  const productId = (b.product_id && b.product_id !== 'general') ? parseInt(b.product_id, 10) : null;
  const on = b.on === true;
  const steps = sanitizeFollowupSteps(b.steps);
  const existing = await loadFollowup(ws.id, productId);
  if (existing) await q('UPDATE followups SET active=$1, steps=$2 WHERE id=$3', [on, JSON.stringify(steps), existing.id]);
  else await q('INSERT INTO followups (workspace_id,product_id,active,steps) VALUES ($1,$2,$3,$4)', [ws.id, productId, on, JSON.stringify(steps)]);
  res.json({ ok: true, on, steps });
}));
// Envío de PRUEBA: manda el primer paso (o el que mandes) a tu número, para verificar que llega.
app.post('/api/followup/test', auth(async (req, res) => {
  const ws = req.workspace;
  if (!ws.wa_connected) return res.status(400).json({ error: 'Conecta el WhatsApp de esta marca primero (Conectar WhatsApp).' });
  const to = String((req.body && req.body.to) || '').replace(/[^0-9]/g, '');
  if (!to) return res.status(400).json({ error: 'Pon tu número con código de país, sin + (ej: 584121234567).' });
  let step = req.body && req.body.step ? sanitizeFollowupSteps([req.body.step])[0] : null;
  if (!step) {
    const productId = (req.body && req.body.product_id && req.body.product_id !== 'general') ? parseInt(req.body.product_id, 10) : null;
    const row = await loadFollowup(ws.id, productId);
    let steps = []; if (row) { try { steps = Array.isArray(row.steps) ? row.steps : JSON.parse(row.steps || '[]'); } catch (e) {} }
    step = steps[0];
  }
  if (!step) return res.status(400).json({ error: 'La secuencia no tiene pasos. Arma y guarda primero.' });
  try { await sendFollowupStep(ws, to, step, null); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: 'Meta rechazó el envío: ' + (e.message || e) }); }
}));
// La IA arma la secuencia de seguimiento para un producto (mensajes + tiempos + botones).
app.post('/api/followup/generate', auth(async (req, res) => {
  const ws = req.workspace;
  const b = req.body || {};
  const productId = (b.product_id && b.product_id !== 'general') ? parseInt(b.product_id, 10) : null;
  let prodName = 'el producto', price = '';
  if (productId) { const p = await one('SELECT name, price FROM products WHERE id=$1 AND workspace_id=$2', [productId, ws.id]); if (p) { prodName = p.name; price = p.price ? (p.price + ' ' + (ws.currency || '')) : ''; } }
  const cc = ws.country_code || '';
  const agentName = ws.agent_name || 'Sofía';
  const sys = `Eres experto en cierres de venta por WhatsApp para PDFmania. Diseñas una SECUENCIA DE SEGUIMIENTO que persigue, dentro de la ventana de 24h, a un cliente que se quedó tibio y NO compró, para cerrarlo con calidez y urgencia creciente (recordatorio → resolver duda → bono → descuento). Escribes en ${labLang(cc)}, mensajes cortos y humanos, con emojis moderados. SOLO puedes usar pasos tipo "message" (texto) con botones opcionales.`;
  const user = `Producto: ${prodName}${price ? ' (precio ' + price + ')' : ''}
Vendedora: ${agentName}
Diseña 3 o 4 pasos de seguimiento que ESCALAN el incentivo. Cada paso: cuánto esperar (en minutos desde el último silencio del cliente) y el mensaje. Añade 1-2 botones cortos de respuesta rápida cuando ayude (ej. "SÍ QUIERO", "TENGO UNA DUDA").
Devuelve SOLO un JSON array (sin texto extra), cada objeto: {"after_min":numero,"type":"message","text":"mensaje","buttons":["botón1","botón2"]}
Tiempos sugeridos que escalan: 20-30 min el primero, 2-3 horas el segundo, 6 horas el tercero. Todo en ${labLang(cc)}.`;
  const out = await callClaudeConversation(sys, [{ role: 'user', content: user }], 2000);
  if (out.error === 'nokey') return res.status(400).json({ error: 'Conecta tu API Key de Claude en Inteligencia IA.' });
  if (out.error) return res.status(400).json({ error: out.error });
  const steps = sanitizeFollowupSteps(extractJson(out.text));
  if (!steps.length) return res.status(400).json({ error: 'La IA no devolvió una secuencia válida, reintenta.' });
  res.json({ steps });
}));

// ---------- Optimización por venta (Conversions API / "pixel" de WhatsApp) ----------
app.get('/api/capi/config', auth(async (req, res) => {
  const ws = req.workspace;
  const leads = await one('SELECT COUNT(*)::int c FROM conversations WHERE workspace_id=$1 AND ctwa_clid IS NOT NULL', [ws.id]);
  const sent = await one('SELECT COUNT(*)::int c FROM conversations WHERE workspace_id=$1 AND capi_sent=true', [ws.id]);
  res.json({
    on: ws.capi_on === true,
    dataset_id: ws.capi_dataset_id || '',
    has_token: !!ws.capi_token,
    waba_id: ws.wa_waba_id || '',
    ad_leads: (leads && leads.c) || 0,
    purchases_sent: (sent && sent.c) || 0,
    count: parseInt((await getSetting('capi_count_' + ws.id)) || '0', 10),
    last_ok: (await getSetting('capi_last_ok_' + ws.id)) || '',
    last_err: (await getSetting('capi_last_err_' + ws.id)) || '',
    workspace_name: ws.name, flag: ws.flag,
  });
}));
app.post('/api/capi/config', auth(async (req, res) => {
  const b = req.body || {};
  const on = b.on === true;
  const dataset = b.dataset_id != null ? String(b.dataset_id).replace(/[^0-9]/g, '') : null;
  const tok = (b.token && String(b.token).trim()) ? String(b.token).trim() : null;
  if (tok) {
    await q('UPDATE workspaces SET capi_on=$1, capi_dataset_id=COALESCE($2,capi_dataset_id), capi_token=$3 WHERE id=$4',
      [on, dataset, tok, req.workspace.id]);
  } else {
    await q('UPDATE workspaces SET capi_on=$1, capi_dataset_id=COALESCE($2,capi_dataset_id) WHERE id=$3',
      [on, dataset, req.workspace.id]);
  }
  res.json({ ok: true, on });
}));
// Verifica ENVIANDO un evento de prueba real (así probamos justo lo que se usará: enviar compras).
// El token de CAPI puede ENVIAR pero no leer el dataset, por eso no hacemos GET.
app.post('/api/capi/verify', auth(async (req, res) => {
  const ws = await one('SELECT * FROM workspaces WHERE id=$1', [req.workspace.id]);
  if (!ws.capi_dataset_id || !ws.capi_token) return res.status(400).json({ error: 'Pega el Dataset ID y el token, y guarda primero.' });
  const testCode = (req.body && req.body.test_code) ? String(req.body.test_code).trim() : null;
  // Con código de prueba usamos un ctwa_clid REAL (de un lead de anuncio) para que Meta lo acepte y lo VEAS
  // en la pestaña "Probar eventos" (no cuenta como venta real). Sin código, va un clid dummy solo para chequear permiso.
  let clid = 'ctwa_verify_test';
  if (testCode) {
    const lead = await one("SELECT ctwa_clid FROM conversations WHERE workspace_id=$1 AND ctwa_clid IS NOT NULL ORDER BY id DESC LIMIT 1", [ws.id]);
    if (lead && lead.ctwa_clid) clid = lead.ctwa_clid;
  }
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { whatsapp_business_account_id: ws.wa_waba_id || undefined, ctwa_clid: clid },
      custom_data: { currency: ws.currency || 'USD', value: 0 },
    }],
  };
  if (testCode) body.test_event_code = testCode; // va a "Probar eventos" (no cuenta como real)
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${ws.capi_dataset_id}/events?access_token=${encodeURIComponent(ws.capi_token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) return res.json({ ok: true, events_received: d.events_received || 1, test: !!testCode });
    const err = (d.error || {}); const msg = err.message || ('HTTP ' + r.status);
    // Distinguimos: error de AUTH/permiso/token = falla real. Error de PAYLOAD (ctwa_clid de prueba) = credenciales OK.
    const isAuth = /permission|token|oauth|access|denied|autoriz/i.test(msg);
    if (isAuth) return res.status(400).json({ error: 'Meta: ' + msg + ' — el token no tiene permiso de envío. Regenéralo desde la Configuración de la API de conversiones de ESE dataset.' });
    // Llegamos a validación de datos => el token SÍ tiene permiso de envío.
    return res.json({ ok: true, credentials_ok: true, note: msg });
  } catch (e) { res.status(400).json({ error: 'No pude conectar con Meta.' }); }
}));

// ---------- Webhook público: registro AUTOMÁTICO de ventas ----------
app.post('/api/webhooks/sale', h(async (req, res) => {
  const secret = req.query.secret || (req.body && req.body.secret);
  if (secret !== WEBHOOK_SECRET) return res.status(401).json({ error: 'Secret inválido' });
  const { workspace_id, product_name, amount, customer_name, source } = req.body || {};
  const ws = await one('SELECT * FROM workspaces WHERE id=$1', [workspace_id]);
  if (!ws) return res.status(404).json({ error: 'Marca no encontrada' });
  if (!amount) return res.status(400).json({ error: 'Monto requerido' });
  const prod = await one('SELECT id FROM products WHERE workspace_id=$1 AND name=$2', [ws.id, product_name || '']);
  const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [ws.id, prod ? prod.id : null, product_name || 'Venta', Math.round(amount), customer_name || 'Cliente', source || 'webhook']);
  res.json({ ok: true, id: s.id });
}));

// ---------- PWA (app instalable) + Notificaciones Push ----------
app.get('/manifest.webmanifest', (req, res) => {
  res.json({
    name: 'PDFmania', short_name: 'PDFmania', start_url: '/', display: 'standalone',
    background_color: '#000000', theme_color: '#000000', orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  });
});
app.get('/icon-192.png', (req, res) => { res.set('Content-Type', 'image/png'); res.set('Cache-Control', 'public, max-age=604800'); res.send(Buffer.from(ICON192_B64, 'base64')); });
app.get('/icon-512.png', (req, res) => { res.set('Content-Type', 'image/png'); res.set('Cache-Control', 'public, max-age=604800'); res.send(Buffer.from(ICON512_B64, 'base64')); });
app.get('/sw.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.send(`self.addEventListener('install', e=>self.skipWaiting());
self.addEventListener('activate', e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push', function(e){
  let d={}; try{ d=e.data.json(); }catch(err){ d={title:'PDFmania', body:(e.data&&e.data.text())||''}; }
  e.waitUntil(self.registration.showNotification(d.title||'PDFmania', {
    body:d.body||'', icon:'/icon-192.png', badge:'/icon-192.png', tag:d.tag||('v'+Date.now()), data:{url:d.url||'/'}, vibrate:[80,40,80]
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(function(cl){ for(const c of cl){ if('focus' in c) return c.focus(); } if(clients.openWindow) return clients.openWindow(e.notification.data&&e.notification.data.url||'/'); }));
});`);
});

// Clave pública VAPID (para que el navegador se suscriba)
app.get('/api/push/vapid', h(async (req, res) => {
  const pub = await getSetting('vapid_public');
  res.json({ publicKey: pub || '', enabled: !!(webpush && pub) });
}));
// Guardar suscripción del dispositivo (por cuenta)
app.post('/api/push/subscribe', auth(async (req, res) => {
  const s = req.body && req.body.subscription;
  if (!s || !s.endpoint) return res.status(400).json({ error: 'Suscripción inválida' });
  const keys = s.keys || {};
  await q(`INSERT INTO push_subs (account_id,endpoint,p256dh,auth) VALUES ($1,$2,$3,$4)
           ON CONFLICT (endpoint) DO UPDATE SET account_id=$1, p256dh=$3, auth=$4`,
    [req.accountId, s.endpoint, keys.p256dh || null, keys.auth || null]);
  res.json({ ok: true });
}));
// Notificación de prueba
app.post('/api/push/test', auth(async (req, res) => {
  await sendPush(req.accountId, { title: '🔔 Prueba PDFmania', body: 'Las notificaciones funcionan ✅', url: '/' });
  res.json({ ok: true });
}));

// Envía una notificación push a todos los dispositivos de una cuenta
async function sendPush(accountId, payload) {
  if (!webpush) return;
  const pub = await getSetting('vapid_public'); if (!pub) return;
  const subs = await many('SELECT id,endpoint,p256dh,auth FROM push_subs WHERE account_id=$1', [accountId]);
  const body = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (e) {
      // 404/410 = suscripción muerta -> borrar
      if (e.statusCode === 404 || e.statusCode === 410) await q('DELETE FROM push_subs WHERE id=$1', [s.id]).catch(() => {});
    }
  }
}
// Notifica una venta a la cuenta dueña del workspace
async function notifySale(ws, product, amount, extra) {
  try {
    const cur = ws.currency || '';
    const monto = Number(amount || 0).toLocaleString('es-CO');
    const title = '💰 ¡Nueva venta! ' + (ws.flag || '') + ' ' + (ws.name || '');
    const body = (product || 'Producto') + ' · ' + monto + ' ' + cur + (extra ? ' · ' + extra : '');
    await sendPush(ws.user_id, { title, body, url: '/' });
  } catch (e) { console.error('notifySale', e.message); }
}

// ---------- Optimización: metas, recuperación, reporte diario ----------
app.get('/api/ops/config', auth(async (req, res) => {
  const ws = req.workspace;
  const fxRow = await one('SELECT fx FROM countries WHERE code=$1', [ws.country_code]);
  res.json({
    recovery_on: ws.recovery_on !== false,
    recovery_hours: ws.recovery_hours || 3,
    recovery_msg: ws.recovery_msg || '',
    goal_amount: Number(ws.goal_amount || 0),
    report_hour: parseInt((await getSetting('report_hour')) || '13', 10),
    report_on: (await getSetting('report_on')) !== '0',
    display_usd: !!ws.display_usd,
    fx_rate: (fxRow && fxRow.fx) || 1,
    fx_updated: (await getSetting('fx_updated')) || '',
    fx_pinned: (await getSetting('fx_pinned_' + ws.country_code)) === '1',
    currency: ws.currency, workspace_name: ws.name, flag: ws.flag,
  });
}));
app.post('/api/ops/config', auth(async (req, res) => {
  const b = req.body || {};
  if (b.recovery_on !== undefined || b.recovery_hours !== undefined || b.recovery_msg !== undefined || b.goal_amount !== undefined || b.display_usd !== undefined) {
    await q('UPDATE workspaces SET recovery_on=COALESCE($1,recovery_on), recovery_hours=COALESCE($2,recovery_hours), recovery_msg=COALESCE($3,recovery_msg), goal_amount=COALESCE($4,goal_amount), display_usd=COALESCE($5,display_usd) WHERE id=$6',
      [b.recovery_on !== undefined ? !!b.recovery_on : null,
       b.recovery_hours !== undefined ? Math.max(1, Math.min(48, parseInt(b.recovery_hours, 10) || 3)) : null,
       b.recovery_msg !== undefined ? b.recovery_msg : null,
       b.goal_amount !== undefined ? Math.round(Number(b.goal_amount) || 0) : null,
       b.display_usd !== undefined ? !!b.display_usd : null, req.workspace.id]);
  }
  if (b.report_hour !== undefined) await setSetting('report_hour', String(Math.max(0, Math.min(23, parseInt(b.report_hour, 10) || 13))));
  if (b.report_on !== undefined) await setSetting('report_on', b.report_on ? '1' : '0');
  res.json({ ok: true });
}));
// Forzar actualización de la tasa (Binance) ahora
app.post('/api/ops/update-fx', auth(async (req, res) => {
  // Volver a AUTO (Binance) para el país de esta marca: quita el pin y fuerza refresco.
  await setSetting('fx_pinned_' + req.workspace.country_code, '0');
  await setSetting('fx_updated', ''); // resetea el candado diario
  await updateFxRates();
  const fxRow = await one('SELECT fx FROM countries WHERE code=$1', [req.workspace.country_code]);
  res.json({ ok: true, fx_rate: (fxRow && fxRow.fx) || 1, pinned: false });
}));
// Tasa MANUAL (fija) para el país de esta marca. Queda "pineada": la actualización diaria de Binance NO la pisa.
app.post('/api/ops/set-fx', auth(async (req, res) => {
  const rate = Number(req.body && req.body.rate);
  if (!rate || isNaN(rate) || rate <= 0) return res.status(400).json({ error: 'Pon una tasa válida (unidades por USD).' });
  await q('UPDATE countries SET fx=$1 WHERE code=$2', [rate, req.workspace.country_code]);
  await setSetting('fx_pinned_' + req.workspace.country_code, '1'); // no la sobreescribe Binance
  res.json({ ok: true, fx_rate: rate, pinned: true });
}));

// Recuperación de carritos: recordatorio a leads en etapa 'pago' que no pagaron
async function runRecovery() {
  const wss = await many('SELECT * FROM workspaces WHERE recovery_on IS NOT FALSE AND wa_connected=true');
  for (const ws of wss) {
    const hrs = ws.recovery_hours || 3;
    const rows = await many(`SELECT id, wa_id FROM conversations
      WHERE workspace_id=$1 AND stage='pago' AND bot_active=true AND recovery_sent_at IS NULL
        AND last_at < now() - make_interval(hours => $2) AND last_at > now() - interval '48 hours'
      LIMIT 30`, [ws.id, hrs]);
    for (const c of rows) {
      const msg = (ws.recovery_msg && ws.recovery_msg.trim()) ? ws.recovery_msg
        : '¡Hola! 👋 Vi que quedaste a un pasito de tu compra. ¿Te ayudo a terminarla? Si ya pagaste, mándame el comprobante y te activo el acceso al instante ✅';
      try {
        await sendWa(ws, c.wa_id, { type: 'text', text: { body: msg } });
        await q('UPDATE conversations SET recovery_sent_at=now(), last_at=now() WHERE id=$1', [c.id]);
        await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [c.id, '🔁 Recordatorio de pago (automático)']);
      } catch (e) {}
    }
  }
}
// ---------- Seguimiento (follow-up dentro de las 24h) · POR PRODUCTO ----------
// Envía un paso del tipo que sea (mensaje, imagen, audio/nota de voz, video, documento, IA) + botones.
async function sendFollowupStep(ws, to, step, convId) {
  const text = String(step.text || step.caption || '').slice(0, 1024);
  const url = String(step.url || '').trim();
  const type = step.type || (url ? 'image' : 'message');
  const buttons = Array.isArray(step.buttons) ? step.buttons.map(b => String(b || '').trim()).filter(Boolean).slice(0, 3) : [];
  let payload, logBody;
  const withButtons = (bodyText, headerMedia) => ({
    type: 'interactive',
    interactive: Object.assign(
      { type: 'button', body: { text: bodyText || '👇' }, action: { buttons: buttons.map((t, i) => ({ type: 'reply', reply: { id: 'fu_' + i, title: t.slice(0, 20) } })) } },
      headerMedia ? { header: headerMedia } : {}),
  });
  if (type === 'ai') {
    const reply = await claudeReply(step.prompt || 'Escribe un mensaje breve y cálido para cerrar la venta.', 'seguimiento');
    payload = { type: 'text', text: { body: (reply || text || '¿Seguimos con tu compra? 😊') } };
    logBody = '🎯🤖 ' + (reply || '').slice(0, 80);
  } else if (type === 'image' && url) {
    payload = buttons.length ? withButtons(text, { type: 'image', image: { link: url } }) : { type: 'image', image: { link: url, caption: text || undefined } };
    logBody = '🖼️ 🎯 ' + (text || 'imagen');
  } else if (type === 'audio' && url) {
    payload = { type: 'audio', audio: { link: url } };
    logBody = '🎤 🎯 nota de voz';
  } else if (type === 'video' && url) {
    payload = { type: 'video', video: { link: url, caption: text || undefined } };
    logBody = '🎬 🎯 ' + (text || 'video');
  } else if (type === 'document' && url) {
    payload = { type: 'document', document: { link: url, filename: step.filename || 'archivo' } };
    logBody = '📎 🎯 ' + (step.filename || 'archivo');
  } else {
    payload = buttons.length ? withButtons(text) : { type: 'text', text: { body: text || '¡Hola! ¿Seguimos con tu compra? 😊' } };
    logBody = '🎯 ' + text + (buttons.length ? ' [' + buttons.join(' · ') + ']' : '');
  }
  await sendWa(ws, to, payload);
  if (convId) await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, logBody]);
}
async function runFollowups() {
  // Cada secuencia está atada a un producto (o general si product_id es NULL).
  const fups = await many(
    `SELECT f.*, w.wa_connected FROM followups f JOIN workspaces w ON w.id=f.workspace_id
     WHERE f.active=true AND w.wa_connected=true`);
  for (const f of fups) {
    let seq = [];
    try { seq = Array.isArray(f.steps) ? f.steps : JSON.parse(f.steps || '[]'); } catch (e) { seq = []; }
    if (!seq.length) continue;
    // Conversaciones de ESE producto (o generales si product_id NULL), activas, no compradas, dentro de 24h.
    const rows = await many(
      `SELECT id, wa_id, followup_idx, followup_at, last_in_at FROM conversations
       WHERE workspace_id=$1 AND bot_active=true AND COALESCE(stage,'') <> 'cliente'
         AND product_id IS NOT DISTINCT FROM $2
         AND followup_idx < $3
         AND (funnel_state IS NULL OR funnel_state = 'NEW_LEAD')
         AND last_in_at IS NOT NULL AND last_in_at > now() - interval '24 hours'
       LIMIT 50`, [f.workspace_id, f.product_id, seq.length]);
    const ws = await one('SELECT * FROM workspaces WHERE id=$1', [f.workspace_id]);
    for (const c of rows) {
      const step = seq[c.followup_idx]; if (!step) continue;
      const anchor = c.followup_at || c.last_in_at;
      const dueMs = (Math.max(1, Number(step.after_min) || 30)) * 60000;
      if (!anchor || (Date.now() - new Date(anchor).getTime()) < dueMs) continue;
      try {
        await sendFollowupStep(ws, c.wa_id, step, c.id);
        await q('UPDATE conversations SET followup_idx=followup_idx+1, followup_at=now(), last_at=now() WHERE id=$1', [c.id]);
      } catch (e) { console.error('followup send', e.message); }
    }
  }
}
// Meta cumplida -> notificación (una vez por mes/país)
async function runGoalChecks() {
  const wss = await many('SELECT * FROM workspaces WHERE goal_amount > 0');
  const ym = new Date().toISOString().slice(0, 7);
  for (const w of wss) {
    const key = 'goalhit_' + w.id + '_' + ym;
    if ((await getSetting(key)) === '1') continue;
    const gtz = /^[A-Za-z_\/+-]+$/.test(w.timezone || '') ? w.timezone : 'UTC';
    const r = await one(`SELECT COALESCE(SUM(amount),0)::float8 s FROM sales WHERE workspace_id=$1 AND date_trunc('month',(created_at AT TIME ZONE '${gtz}'))=date_trunc('month',(now() AT TIME ZONE '${gtz}'))`, [w.id]);
    if (r.s >= Number(w.goal_amount)) {
      await sendPush(w.user_id, { title: '🎯 ¡Meta cumplida! ' + (w.flag || '') + ' ' + w.name, body: 'Alcanzaste tu meta del mes: ' + Math.round(r.s).toLocaleString('es-CO') + ' ' + w.currency + ' 🎉', url: '/' });
      await setSetting(key, '1');
    }
  }
}
// Resumen del día anterior por cuenta
async function accountDailySummary(accountId) {
  const wss = await many('SELECT * FROM workspaces WHERE user_id=$1', [accountId]);
  if (!wss.length) return null;
  let revUsd = 0, sales = 0, spendUsd = 0; const prodRev = {};
  for (const w of wss) {
    const c = await one('SELECT fx FROM countries WHERE code=$1', [w.country_code]); const fx = (c && c.fx) || 1;
    const stz = /^[A-Za-z_\/+-]+$/.test(w.timezone || '') ? w.timezone : 'UTC';
    const yday = `((now() AT TIME ZONE '${stz}')::date - 1)`;
    const dc = `(created_at AT TIME ZONE '${stz}')::date`;
    const r = await one(`SELECT COALESCE(SUM(amount),0)::float8 s, COUNT(*)::int c FROM sales WHERE workspace_id=$1 AND ${dc} = ${yday}`, [w.id]);
    revUsd += r.s / fx; sales += r.c;
    const pr = await many(`SELECT product_name, COALESCE(SUM(amount),0)::float8 s FROM sales WHERE workspace_id=$1 AND ${dc}=${yday} GROUP BY product_name`, [w.id]);
    pr.forEach(x => { prodRev[x.product_name] = (prodRev[x.product_name] || 0) + x.s / fx; });
  }
  const codes = [...new Set(wss.map(w => w.country_code))];
  if (codes.length) { const sp = await one("SELECT COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code=ANY($1::text[]) AND date=current_date-1", [codes]); spendUsd = sp.s; }
  const best = Object.entries(prodRev).sort((a, b) => b[1] - a[1])[0];
  const roas = spendUsd > 0 ? (revUsd / spendUsd) : null;
  return sales + ' venta(s) · US$' + revUsd.toFixed(0) + ' · Gasto US$' + spendUsd.toFixed(0) + ' · ROAS ' + (roas != null ? roas.toFixed(2) : '—') + (best ? ' · Top: ' + best[0] : '');
}
async function runDailyReport() {
  if ((await getSetting('report_on')) === '0') return;
  const hour = parseInt((await getSetting('report_hour')) || '13', 10);
  const now = new Date();
  if (now.getUTCHours() < hour) return;
  const today = now.toISOString().slice(0, 10);
  if ((await getSetting('report_sent_date')) === today) return;
  const owners = await many('SELECT DISTINCT COALESCE(owner_id, id) aid FROM users');
  for (const o of owners) {
    const s = await accountDailySummary(o.aid);
    if (s) await sendPush(o.aid, { title: '📅 Reporte de ayer · PDFmania', body: s, url: '/' });
  }
  await setSetting('report_sent_date', today);
}
// Tasa real USDT→fiat desde el P2P de Binance (para monedas volátiles: VES, ARS)
async function fetchBinanceRate(fiat) {
  try {
    const r = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'accept': '*/*', 'clienttype': 'web',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'origin': 'https://p2p.binance.com', 'referer': 'https://p2p.binance.com/',
      },
      body: JSON.stringify({ fiat, asset: 'USDT', tradeType: 'SELL', page: 1, rows: 12, payTypes: [], publisherType: null }),
    });
    const d = await r.json();
    const prices = ((d && d.data) || []).map(x => parseFloat(x.adv && x.adv.price)).filter(n => n > 0).sort((a, b) => a - b);
    if (!prices.length) return null;
    return prices[Math.floor(prices.length / 2)]; // mediana
  } catch (e) { console.error('[binance]', e.message); return null; }
}
async function updateFxRates() {
  const today = new Date().toISOString().slice(0, 10);
  if ((await getSetting('fx_updated')) === today) return; // una vez al día
  let any = false;
  for (const [cc, fiat] of [['VE', 'VES'], ['AR', 'ARS'], ['BR', 'BRL']]) {
    if ((await getSetting('fx_pinned_' + cc)) === '1') continue; // tasa fijada a mano: no tocar
    const rate = await fetchBinanceRate(fiat);
    if (rate && rate > 0) {
      await q('UPDATE countries SET fx=$1 WHERE code=$2', [rate, cc]);
      await setSetting('fx_rate_' + cc, String(rate));
      console.log('[fx] ' + cc + ' -> ' + rate + ' ' + fiat + '/USD (Binance)');
      any = true;
    }
  }
  if (any) await setSetting('fx_updated', today);
}
let _opsRunning = false;
async function runOps() {
  if (_opsRunning) return; _opsRunning = true;
  try { await updateFxRates(); await runRecovery(); await runFollowups(); await runMotorFollowups(); await runGoalChecks(); await runDailyReport(); }
  catch (e) { console.error('runOps', e.message); }
  finally { _opsRunning = false; }
}
setInterval(runOps, 15 * 60 * 1000);
setTimeout(runOps, 30000);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- Páginas legales (para publicar la app en Meta) ----------
function legalPage(title, bodyHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · PDFmania</title>
<style>
body{background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.7;margin:0;padding:40px 20px}
.wrap{max-width:760px;margin:0 auto}
h1{color:#fff;font-size:28px;margin-bottom:4px}
h2{color:#fff;font-size:18px;margin-top:32px}
.date{color:#888;font-size:14px;margin-bottom:24px}
a{color:#fff}
p,li{color:#cfcfcf;font-size:15px}
.foot{margin-top:40px;padding-top:20px;border-top:1px solid #222;color:#777;font-size:13px}
</style></head><body><div class="wrap">${bodyHtml}
<div class="foot">PDFmania · Contacto: <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a></div>
</div></body></html>`;
}

app.get('/privacidad', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(legalPage('Política de Privacidad', `
  <h1>Política de Privacidad</h1>
  <div class="date">PDFmania — Última actualización: 2026</div>
  <p>En PDFmania ("nosotros") respetamos tu privacidad. Esta política explica qué datos recopilamos, cómo los usamos y tus derechos. Al comunicarte con nosotros por WhatsApp o comprar nuestros productos digitales, aceptas lo aquí descrito.</p>

  <h2>1. Quiénes somos</h2>
  <p>PDFmania comercializa productos digitales (guías, plantillas y cursos en formato PDF) que se atienden y entregan a través de WhatsApp. Puedes contactarnos en <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>.</p>

  <h2>2. Qué información recopilamos</h2>
  <ul>
    <li><b>Datos de contacto:</b> tu número de teléfono y nombre de WhatsApp cuando nos escribes.</li>
    <li><b>Mensajes:</b> el contenido de las conversaciones necesarias para atender tu consulta y tu compra.</li>
    <li><b>Comprobantes de pago:</b> cuando envías una imagen de comprobante, procesamos el monto, la referencia y el beneficiario únicamente para verificar y confirmar tu compra.</li>
    <li><b>Datos de la compra:</b> producto adquirido y estado de entrega.</li>
  </ul>

  <h2>3. Para qué usamos tus datos</h2>
  <ul>
    <li>Responder tus consultas y brindarte atención al cliente.</li>
    <li>Verificar pagos y entregar automáticamente el producto adquirido.</li>
    <li>Enviarte información relacionada con tu compra.</li>
  </ul>
  <p>No vendemos ni alquilamos tus datos personales a terceros.</p>

  <h2>4. WhatsApp y Meta</h2>
  <p>Usamos la API oficial de WhatsApp Business (Meta Platforms, Inc.) para enviar y recibir mensajes. El tratamiento de datos dentro de WhatsApp se rige también por las políticas de Meta.</p>

  <h2>5. Conservación de datos</h2>
  <p>Conservamos tus datos solo el tiempo necesario para prestarte el servicio y cumplir obligaciones legales. Puedes solicitar su eliminación cuando quieras.</p>

  <h2>6. Tus derechos</h2>
  <p>Puedes solicitar acceder, corregir o eliminar tus datos escribiendo a <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>. Atenderemos tu solicitud en un plazo razonable.</p>

  <h2>7. Eliminación de datos</h2>
  <p>Para eliminar tus datos, envía un correo a <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a> con el asunto "Eliminar mis datos" desde el mismo contacto, o escríbenos por WhatsApp. Eliminaremos tu información de nuestros sistemas.</p>

  <h2>8. Cambios</h2>
  <p>Podemos actualizar esta política. La versión vigente estará siempre disponible en esta página.</p>
  `));
});

app.get('/terminos', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(legalPage('Términos del Servicio', `
  <h1>Términos del Servicio</h1>
  <div class="date">PDFmania — Última actualización: 2026</div>
  <p>Estos términos regulan la compra y el uso de los productos digitales de PDFmania. Al realizar una compra, los aceptas.</p>

  <h2>1. Productos</h2>
  <p>PDFmania vende productos digitales (archivos PDF: guías, plantillas y cursos). La entrega es digital, a través de WhatsApp, tras confirmar el pago.</p>

  <h2>2. Pagos</h2>
  <p>El pago se realiza por transferencia u otros medios indicados. La compra se confirma al verificar el comprobante (monto y beneficiario correctos). Cada comprobante es válido una sola vez.</p>

  <h2>3. Entrega</h2>
  <p>Una vez verificado el pago, el producto se entrega de forma automática por WhatsApp. Si no recibes tu producto, escríbenos a <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>.</p>

  <h2>4. Naturaleza digital</h2>
  <p>Por tratarse de productos digitales de entrega inmediata, las devoluciones aplican solo en caso de error comprobado en la entrega. Ante cualquier inconveniente, contáctanos y buscaremos una solución justa.</p>

  <h2>5. Uso permitido</h2>
  <p>Los productos son para uso personal del comprador. No está permitida su reventa ni distribución no autorizada.</p>

  <h2>6. Contacto</h2>
  <p>Para cualquier duda: <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>.</p>
  `));
});

// Root -> app (index.html autocontenido en la raíz). no-store: nunca cachear el HTML.
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Migración: si el WhatsApp estaba guardado GLOBAL (una sola marca), lo pasa a esa marca.
async function migrateWaToWorkspace() {
  try {
    const gPhone = await getSetting('wa_phone_number_id');
    const gWsId = await getSetting('wa_workspace_id');
    if (!gPhone || !gWsId) return;
    const wsId = parseInt(gWsId, 10);
    const ws = await one('SELECT id, wa_phone_number_id FROM workspaces WHERE id=$1', [wsId]);
    if (ws && !ws.wa_phone_number_id) {
      const gToken = await getSetting('wa_token');
      const gWaba = await getSetting('wa_waba_id');
      const gConn = (await getSetting('wa_connected')) === '1';
      await q('UPDATE workspaces SET wa_phone_number_id=$1, wa_token=$2, wa_waba_id=$3, wa_connected=$4 WHERE id=$5',
        [gPhone, gToken, gWaba || null, gConn, wsId]);
      console.log('[migrate] WhatsApp global -> marca', wsId);
    }
    // Limpia las llaves globales para que no se reusen por error entre países
    await setSetting('wa_phone_number_id', '');
    await setSetting('wa_token', '');
    await setSetting('wa_workspace_id', '');
  } catch (e) { console.error('[migrate wa] ', e.message); }
}

// Genera/carga las claves VAPID para notificaciones push
async function ensureVapid() {
  if (!webpush) return;
  try {
    let pub = await getSetting('vapid_public');
    let priv = await getSetting('vapid_private');
    if (!pub || !priv) {
      const keys = webpush.generateVAPIDKeys();
      pub = keys.publicKey; priv = keys.privateKey;
      await setSetting('vapid_public', pub); await setSetting('vapid_private', priv);
      console.log('[push] claves VAPID generadas');
    }
    const contact = process.env.VAPID_CONTACT || 'mailto:captaclick@gmail.com';
    webpush.setVapidDetails(contact, pub, priv);
  } catch (e) { console.error('[push] ensureVapid', e.message); }
}

// Arranque: inicializa la base y siembra si está vacía
(async () => {
  try {
    await init();
    await seed();
    await migrateWaToWorkspace();
    await ensureVapid();
    // Una sola vez: Venezuela arranca mostrando en USD (moneda muy volátil)
    if ((await getSetting('ve_usd_default')) !== '1') {
      await q("UPDATE workspaces SET display_usd=true WHERE country_code='VE'").catch(() => {});
      await setSetting('ve_usd_default', '1');
    }
    setTimeout(() => updateFxRates().catch(() => {}), 8000); // tasa Binance al arrancar
    app.listen(PORT, () => console.log(`PDFmania corriendo en http://localhost:${PORT}`));
  } catch (e) {
    console.error('Error al iniciar:', e);
    process.exit(1);
  }
})();
