export interface Translation {
  locale: string;
  messages: Map<string, string>;
}

export interface ITranslationService {
  initialize(): Promise<void>;
  getTranslation(locale: string): Translation | undefined;
  getAllTranslations(): Translation[];
  findMissingTranslations(key: string): Promise<string[]>;
  dispose(): void;
}
