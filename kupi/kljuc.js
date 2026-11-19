/*
 * Stripe publishable ključ za checkout (/kupi/) i hvala stranu (/kupi/hvala/). Javan je, sme da stoji u kodu.
 * Za sada SAMO test mod: upiši pk_test_... iz Stripe dashboarda (Developers → API keys, prekidač "Test mode").
 * Mora biti iz istog Stripe naloga kao STRIPE_SECRET_KEY u webapp-u (sk_test_...).
 * Live ključ (pk_live_...) ide tek kad Nemanja kaže, zajedno sa SHOP_STRIPE_LIVE=1 na serveru.
 */
// Lokalno (localhost) test ključ, da proba ide kroz Stripe test mod sa sk_test_ iz webapp/.env.local.
window.SHOP_STRIPE_PK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'pk_test_51T1vmm3HELbuFgpdNNWCtXqbxtDKZN2sWr1kXVS1igd2HXNaCpnoMQEaF8477wSFMDeLU9vgO8fLLehxxteUFKYg00OGT8tHqy'
  : 'pk_live_51T1vmm3HELbuFgpd7j8pyyDlbCA0u17fPyrwUzVMCv4GpWfrRTu2dYTYfYtC0gwHrYS09tQaKKaVZ1Dy3yY1iOOF00kp9erVbD';
