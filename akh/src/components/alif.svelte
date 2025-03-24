<script lang="ts">
  import { onMount } from 'svelte';
  import autosize from 'autosize';

  interface HTMLElementEvent<T extends HTMLElement> extends Event {
    target: T;
  }

  let promptInput: HTMLTextAreaElement;
  let greeting: HTMLHeadingElement;
  let typingTip: HTMLDivElement;
  let loadingOverlay: HTMLDivElement;
  let resultText: string = '';
  let isInputPage: boolean = true;

  onMount(() => {
    if (promptInput) {
      autosize(promptInput);
    }
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
    }
  });

  function handleInput(event: HTMLElementEvent<HTMLTextAreaElement>): void {
      if (greeting && promptInput.value.length > 0) {
        greeting.classList.add('hidden');
        promptInput.classList.add('modified');
        typingTip.classList.remove('hidden');
      } else if (greeting && promptInput.value.length === 0) {
        greeting.classList.remove('hidden');
        promptInput.classList.remove('modified');
        typingTip.classList.add('hidden');
      }
    }

  function handleKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  }

  function submitPrompt(): void {
    isInputPage = false;
    resultText = 'Your response will appear here...';
  }

  function goBack(): void {
    isInputPage = true;
    setTimeout(() => {
      if (promptInput) {
        promptInput.focus();
      }
    }, 0);
  }
</script>

<div id="loading-overlay" bind:this={loadingOverlay}>
  <div class="loader-content">
    <div class="loader"></div>
    <p>initializing...</p>
  </div>
</div>

<div id="input-page" class="page" class:active={isInputPage}>
  <div class="container">
    <h1 id="greeting" bind:this={greeting}>Assalamualaikum!</h1>
    <textarea
      bind:this={promptInput}
      id="prompt-input"
      placeholder="What would you like to learn today?"
      on:input={handleInput}
      on:keypress={handleKeyPress}
      autofocus
    ></textarea>
  </div>
  <div id="typing-tip" class="hidden" bind:this={typingTip}>
    just press enter to search
  </div>
</div>

<div id="result-page" class="page" class:active={!isInputPage}>
  <div class="close">
    <button class="back-btn" on:click={goBack}>
      <span class="material-symbols-rounded">close</span>
    </button>
  </div>
  <div class="container">
    <div id="result-text">{resultText}</div>
  </div>
</div>

<style>
  :global(.material-symbols-rounded) {
    font-family: 'Material Symbols Rounded';
    font-weight: normal;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-smoothing: antialiased;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Onest', sans-serif;
    background: #fff8e7;
    color: #000;
    min-height: 100vh;
    overflow: hidden;
  }

  .page {
    height: 100vh;
    width: 100vw;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.5s;
  }

  .page.active {
    opacity: 1;
    pointer-events: auto;
  }

  .container {
    position: relative;
    width: 95%;
    margin: 0 auto;
    min-height: 100vh;
    margin-left: 40px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: left;
  }

  #greeting {
    position: absolute;
    top: 35%;
    left: 0;
    opacity: 1;
    visibility: visible;
    transition: opacity 0.5s ease, visibility 0.5s ease;
    font-size: 200%;
  }

  .hidden {
    opacity: 0 !important;
    visibility: hidden !important;
  }

  #prompt-input {
    position: absolute;
    top: 45%;
    left: 0;
    transform: translateY(0);
    transition: all 0.5s ease;
    font-family: 'Onest', sans-serif;
    width: 100%;
    padding: 15px;
    background: transparent;
    border: none;
    color: #000;
    font-size: 3rem;
    margin-bottom: 20px;
    resize: vertical;
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #prompt-input:focus {
    outline: none;
  }

  #prompt-input.modified {
    top: 50%;
    transform: translateY(-50%);
    display: block;
    white-space: normal;
    width: 100%;
    resize: vertical;
    font-size: 7rem;
  }

  #typing-tip {
    position: absolute;
    bottom: 0;
    left: 0;
    margin-left: 40px;
    margin-bottom: 40px;
    font-size: 1.5em;
    color: #666;
    transition: all 0.5s;
  }

  .close {
    position: absolute;
    top: 0;
    left: 0;
    margin-left: 40px;
    margin-top: 40px;
  }

  .back-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    color: #000;
    font-size: 1.5em;
  }

  #result-text {
    max-height: 80vh;
    overflow-y: auto;
    padding: 0.5rem;
    font-size: 2rem;
    white-space: pre-wrap;
    line-height: 1.6;
  }

  #loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #fff8e7;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .loader-content {
    text-align: center;
  }

  .loader {
    width: 50px;
    height: 50px;
    border: 2px solid #00000020;
    border-radius: 50%;
    border-top-color: #000;
    margin: 0 auto;
    animation: spin 1s ease-in-out infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .container {
      margin-left: 20px;
      margin-right: 20px;
      width: auto;
    }

    #prompt-input {
      font-size: 2rem;
    }

    #prompt-input.modified {
      font-size: 4rem;
    }

    #result-text {
      font-size: 1.5rem;
    }

    #typing-tip {
      margin-left: 20px;
      margin-bottom: 20px;
      font-size: 1.2em;
    }

    .close {
      margin-left: 20px;
      margin-top: 20px;
    }
  }

  @media (max-width: 480px) {
    #prompt-input {
      font-size: 1.5rem;
    }

    #prompt-input.modified {
      font-size: 3rem;
    }

    #result-text {
      font-size: 1.2rem;
    }
  }
</style>
