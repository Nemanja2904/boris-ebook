/*
 * Stripe publishable ključ za checkout (/kupi/) i hvala stranu (/kupi/hvala/). Javan je, sme da stoji u kodu.
 * Za sada SAMO test mod: upiši pk_test_... iz Stripe dashboarda (Developers → API keys, prekidač "Test mode").
 * Mora biti iz istog Stripe naloga kao STRIPE_SECRET_KEY u webapp-u (sk_test_...).
 * Live ključ (pk_live_...) ide tek kad Nemanja kaže, zajedno sa SHOP_STRIPE_LIVE=1 na serveru.
 */
window.SHOP_STRIPE_PK = '';
