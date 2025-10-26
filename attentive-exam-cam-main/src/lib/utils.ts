import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Test {
  id: string;
  code: string;
  title: string;
  duration: string;
  description: string;
  questions: {
    id: number;
    text: string;
    options: string[];
    correctAnswer: number;
  }[];
  createdAt: string;
  // optional creator email (Gmail) used to associate tests with creators
  creatorEmail?: string;
}

export function generateTestCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function saveTest(test: Test): void {
  const tests = getTests();
  tests.push(test);
  localStorage.setItem('examguard_tests', JSON.stringify(tests));
}

export function getTests(): Test[] {
  const tests = localStorage.getItem('examguard_tests');
  return tests ? JSON.parse(tests) : [];
}

export function getTestByCode(code: string): Test | null {
  const tests = getTests();
  return tests.find(test => test.code === code) || null;
}
