// Ієрархія помилок: кожна несе готовий HTTP-статус, тож ErrorHandler просто віддає її клієнту.
//
//   Error
//    └─ AppError (status)
//        ├─ ValidationError       400  поганий ввід користувача
//        ├─ UnknownCurrencyError  404  такої валюти немає
//        └─ ProviderError         502  проблема на боці постачальника курсів
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name; // імʼя реального класу: ValidationError, ProviderError, ...
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class UnknownCurrencyError extends AppError {
  constructor(code: string) {
    super(`Unknown currency: ${code}`, 404);
  }
}

export class ProviderError extends AppError {
  constructor(message: string) {
    super(message, 502);
  }
}
