import * as assert from 'assert';
import * as sinon from 'sinon';

describe('Logger Tests', () => {
  let Logger: any;
  let vscode: any;
  let logger: any;
  let outputChannelStub: any;
  let createOutputChannelStub: sinon.SinonStub;

  beforeEach(() => {
    // Clear the module cache first
    delete require.cache[require.resolve('../../utils/logger')];

    // Import vscode and create stubs
    vscode = require('vscode');

    outputChannelStub = {
      appendLine: sinon.stub(),
      dispose: sinon.stub(),
      clear: sinon.stub(),
      hide: sinon.stub(),
      show: sinon.stub(),
      name: 'next-intl-hlpr',
      replace: sinon.stub(),
      append: sinon.stub()
    };

    createOutputChannelStub = sinon
      .stub(vscode.window, 'createOutputChannel')
      .returns(outputChannelStub);

    // Import Logger after setting up the mock
    Logger = require('../../utils/logger').Logger;

    logger = new Logger();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create output channel with correct name', () => {
    assert(createOutputChannelStub.calledWith('next-intl-hlpr'));
  });

  it('should log message with timestamp', () => {
    const message = 'Test message';
    logger.log(message);

    assert(outputChannelStub.appendLine.calledOnce);
    const loggedMessage = outputChannelStub.appendLine.getCall(0).args[0];
    assert(loggedMessage.includes(message));
    assert(
      /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/.test(loggedMessage)
    );
  });

  it('should log message with error object', () => {
    const message = 'Test message';
    const error = new Error('Test error');
    const consoleErrorStub = sinon.stub(console, 'error');

    logger.log(message, error);

    assert(outputChannelStub.appendLine.calledTwice);

    const firstCall = outputChannelStub.appendLine.getCall(0).args[0];
    assert(firstCall.includes(message));

    const secondCall = outputChannelStub.appendLine.getCall(1).args[0];
    assert(secondCall.includes('Error: Test error'));

    assert(consoleErrorStub.calledOnceWithExactly(error));

    consoleErrorStub.restore();
  });

  it('should log message with string error', () => {
    const message = 'Test message';
    const error = 'String error';
    const consoleErrorStub = sinon.stub(console, 'error');

    logger.log(message, error);

    assert(outputChannelStub.appendLine.calledTwice);

    const secondCall = outputChannelStub.appendLine.getCall(1).args[0];
    assert(secondCall.includes('Error: String error'));

    assert(consoleErrorStub.calledOnceWithExactly(error));

    consoleErrorStub.restore();
  });

  it('should dispose output channel', () => {
    logger.dispose();
    assert(outputChannelStub.dispose.calledOnce);
  });

  it('should handle error with message property', () => {
    const message = 'Test message';
    const error = {message: 'Error with message property'};
    const consoleErrorStub = sinon.stub(console, 'error');

    logger.log(message, error);

    assert(outputChannelStub.appendLine.calledTwice);
    const secondCall = outputChannelStub.appendLine.getCall(1).args[0];
    assert(secondCall.includes('Error: Error with message property'));

    consoleErrorStub.restore();
  });

  it('should handle error without message property', () => {
    const message = 'Test message';
    const error = {code: 500};
    const consoleErrorStub = sinon.stub(console, 'error');

    logger.log(message, error);

    assert(outputChannelStub.appendLine.calledTwice);
    const secondCall = outputChannelStub.appendLine.getCall(1).args[0];
    assert(secondCall.includes('Error: [object Object]'));

    consoleErrorStub.restore();
  });
});
