/**
 * OFFSITE HUD legibility (F-032): the office's ink scrim turns the desert sky to night, so Offsite gets a deeper sky blue
 * that fades out by 120 px, and the text carries the legibility. text-shadow inherits, so setting it on the HUD bar
 * covers the timer, both names, the BOT / YOU labels, the weapon / ammo lines and FIRST TO.
 */
export const OFFSITE_HUD_SCRIM = 'linear-gradient(180deg, rgba(38,104,150,0.45) 0px, rgba(38,104,150,0) 120px)';
export const OFFSITE_HUD_TEXT_SHADOW = '0 1px 0 rgba(10,13,24,0.9), 0 0 6px rgba(10,13,24,0.7)';
