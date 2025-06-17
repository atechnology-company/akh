<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { t } from '$lib/i18n';
  import { accentColor, gradientColor } from '$lib/stores/accentColor';
  
  // Props
  export let showModal = false;
  export let geminiApiKey = '';
  export let googleApiKey = '';
  
  // Event dispatcher
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  // Local state
  let geminiInputValue = geminiApiKey;
  let googleInputValue = googleApiKey;
  let isVisible = false;
  let modalElement: HTMLDivElement;
  
  // Watch for modal visibility changes
  $: {
    if (showModal) {
      geminiInputValue = geminiApiKey;
      googleInputValue = googleApiKey;
      isVisible = true;
    }
  }
  
  // Functions
  function saveApiKeys() {
    dispatch('save', {
      gemini: geminiInputValue.trim(),
      google: googleInputValue.trim()
    });
    closeModal();
  }
  
  function closeModal() {
    isVisible = false;
    // Use a shorter delay for smoother transitions
    setTimeout(() => {
      if (!isVisible) dispatch('close');
    }, 200);
  }
  
  // Handle escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }
</script>

{#if showModal}
<div 
  class="modal-backdrop" 
  transition:fade={{ duration: 250, easing: (t) => t * (2 - t) }}
  on:click={closeModal}
  on:keydown={handleKeydown}
  tabindex="0"
  bind:this={modalElement}
>
  <div 
    class="modal-container" 
    on:click|stopPropagation
    in:fly={{ y: 30, duration: 300, delay: 50 }}
    out:fly={{ y: -20, duration: 200 }}
  >
    <div class="modal-content">
      <h2>API Key Settings</h2>
      
      <p class="description">
        Configure your API keys to enable enhanced features in the app.
      </p>
      
      <div class="input-group">
        <label for="gemini-api-key-input">
          <span class="api-label">Gemini API Key</span>
          <span class="api-description">For AI-powered text generation and analysis</span>
        </label>
        <input 
          type="password" 
          id="gemini-api-key-input" 
          bind:value={geminiInputValue} 
          placeholder="Enter your Gemini API key"
          autocomplete="off"
        />
        <div class="help-text">
          Get your free API key from 
          <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>
        </div>
      </div>

      <div class="input-group">
        <label for="google-api-key-input">
          <span class="api-label">Google API Key</span>
          <span class="api-description">For Maps, Places, and location services</span>
        </label>
        <input 
          type="password" 
          id="google-api-key-input" 
          bind:value={googleInputValue} 
          placeholder="Enter your Google API key"
          autocomplete="off"
        />
        <div class="help-text">
          Get your API key from 
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>
        </div>
      </div>
      
      <div class="button-group">
        <button class="cancel-button" on:click={closeModal}>Cancel</button>
        <button class="save-button" on:click={saveApiKeys}>Save</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    animation: backdropFadeIn 0.25s ease-out forwards;
  }
  
  @keyframes backdropFadeIn {
    from {
      opacity: 0;
      backdrop-filter: blur(0px);
    }
    to {
      opacity: 1;
      backdrop-filter: blur(8px);
    }
  }
  
  .modal-container {
    width: 90%;
    max-width: 550px;
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 16px;
    box-shadow: 
      0 20px 40px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.1);
    transform: scale(0.95);
    opacity: 0;
    animation: modalSlideIn 0.3s ease-out 0.05s forwards;
  }
  
  @keyframes modalSlideIn {
    from {
      transform: scale(0.95) translateY(20px);
      opacity: 0;
    }
    to {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
  }
  
  .modal-content {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.95));
    backdrop-filter: blur(20px);
    color: #333333;
    padding: 32px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
  
  h2 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--accent-color);
    text-align: center;
  }
  
  .description {
    margin-bottom: 32px;
    line-height: 1.6;
    color: #666666;
    text-align: center;
    font-size: 0.95rem;
  }
  
  .input-group {
    margin-bottom: 28px;
  }
  
  label {
    display: block;
    margin-bottom: 12px;
  }
  
  .api-label {
    display: block;
    font-weight: 600;
    color: var(--accent-color);
    font-size: 1rem;
    margin-bottom: 4px;
  }
  
  .api-description {
    display: block;
    font-size: 0.85rem;
    color: #888888;
    font-weight: 400;
  }
  
  input {
    width: 100%;
    padding: 14px 18px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-radius: 10px;
    font-size: 1rem;
    background-color: rgba(255, 255, 255, 0.1);
    color: #333333;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    box-sizing: border-box;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  }
  
  input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 
      0 0 0 4px rgba(var(--accent-color-rgb, 0, 114, 255), 0.15),
      0 4px 12px rgba(var(--accent-color-rgb, 0, 114, 255), 0.1);
    background-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-1px);
  }
  
  input:hover:not(:focus) {
    border-color: rgba(var(--accent-color-rgb, 0, 114, 255), 0.6);
    background-color: rgba(255, 255, 255, 0.18);
    transform: translateY(-0.5px);
  }
  
  .help-text {
    margin-top: 8px;
    font-size: 0.8rem;
    color: #999999;
    line-height: 1.4;
  }
  
  .help-text a {
    color: var(--accent-color);
    text-decoration: none;
    transition: all 0.2s ease;
    font-weight: 500;
  }
  
  .help-text a:hover {
    text-decoration: underline;
    filter: brightness(1.1);
  }
  
  .button-group {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    margin-top: 32px;
  }
  
  button {
    padding: 14px 28px;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    min-width: 100px;
  }
  
  button:active {
    transform: translateY(1px);
  }
  
  .cancel-button {
    background-color: transparent;
    color: var(--accent-color);
    border: 2px solid var(--accent-color);
    position: relative;
  }
  
  .cancel-button:hover {
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(var(--accent-color-rgb, 0, 114, 255), 0.25);
  }
  
  .cancel-button:hover::before {
    transform: translateX(0);
  }
  
  .cancel-button::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--accent-color);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: -1;
  }
  
  .save-button {
    background: var(--gradient-color, linear-gradient(135deg, var(--accent-color), var(--accent-color)));
    color: white;
    border: none;
    background-size: 200% 100%;
    background-position: 0% center;
    box-shadow: 0 4px 16px rgba(var(--accent-color-rgb, 0, 114, 255), 0.3);
  }
  
  .save-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(var(--accent-color-rgb, 0, 114, 255), 0.4);
    animation: saveButtonPulse 1.2s ease-in-out;
  }
  
  @keyframes saveButtonPulse {
    0% {
      background-position: 0% center;
    }
    50% {
      background-position: 100% center;
    }
    100% {
      background-position: 0% center;
    }
  }
  
  @media (max-width: 600px) {
    .modal-content {
      padding: 24px;
    }
    
    h2 {
      font-size: 1.4rem;
    }
    
    button {
      padding: 12px 20px;
      font-size: 0.95rem;
    }
    
    .button-group {
      gap: 12px;
    }
    
    input {
      padding: 12px 16px;
    }
  }
  
  /* Ensure accent color variables are available */
  :global(:root) {
    --accent-color-rgb: 0, 114, 255;
  }
</style>