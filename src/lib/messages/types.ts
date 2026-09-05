import en from './en';

/** Every message key in the app — derived from the English (source) dict. */
export type MsgKey = keyof typeof en;

/** A complete dictionary for one locale. Typechecked: every locale must
 *  translate every key (no silent English fallbacks for whole screens). */
export type Dict = Record<MsgKey, string>;
