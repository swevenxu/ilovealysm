export interface SubjectSection {
  name: string;
  code: string;
  startPage: number | null;
  endPage: number | null;
}

export const PINNACLE_SUBJECTS: SubjectSection[] = [
  { name: 'Financial Accounting and Reporting', code: 'FAR', startPage: 2, endPage: 208 },
  { name: 'Advanced Financial Accounting and Reporting', code: 'AFAR', startPage: 209, endPage: 317 },
  { name: 'Management Services', code: 'MS', startPage: 318, endPage: 416 },
  { name: 'Auditing Theory', code: 'AT', startPage: 417, endPage: 516 },
  { name: 'Auditing Practice', code: 'AP', startPage: 517, endPage: 543 },
  { name: 'Taxation', code: 'TAX', startPage: 544, endPage: 670 },
  { name: 'Regulatory Framework for Business Transactions', code: 'RFBT', startPage: 671, endPage: 977 },
];

export function isPinnacleFile(filename: string): boolean {
  return filename.toLowerCase() === 'pinnacle ho.pdf';
}

export function isAllowedStudyFile(filename: string): boolean {
  return isPinnacleFile(filename);
}

export function getPinnacleSubject(name: string): SubjectSection | undefined {
  return PINNACLE_SUBJECTS.find((subject) => subject.name === name || subject.code === name);
}
