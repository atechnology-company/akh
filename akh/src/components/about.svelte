<script>
    import { onMount } from 'svelte';
    import { fade, slide, crossfade } from 'svelte/transition';
    import { cubicOut } from 'svelte/easing';
    
    let showHeading = false;
    let gradientActive = false;
    let showContent = false;
    let showButtons = false;
    
    onMount(() => {
        // Animation sequence
        setTimeout(() => {
            showHeading = true; // Show white text
            
            setTimeout(() => {
                gradientActive = true; // Activate gradient animation
                
                // Show content with feathered linear wipe after gradient completes
                setTimeout(() => {
                    showContent = true;
                    
                    // Show buttons sooner
                    setTimeout(() => {
                        showButtons = true;
                    }, 400);
                }, 500);
            }, 600);
        }, 300);
    });
</script>

<div class="container">
    <div class="about-container">
        {#if showHeading}
            <h1 class="visible white-text" class:gradient-active={gradientActive}>
                Assalamualaikum!
            </h1>
        {/if}
        
        {#if showContent}
            <div class="content-wrapper" transition:slide={{ duration: 800, easing: cubicOut, axis: 'y' }}>
                <div class="content-fade" in:fade={{ duration: 600, delay: 200 }}>
                    <p>i'm max, or abdurrahman, and i am a cantonese-english muslim teen and the founder of <span style="color: #ff6600;">a</span>technology company. i started akh because there are a lot of salah time apps, however none looked exactly the way i wanted them to or had the feature set i wanted. i want something minimal and something that looks beautiful. i like making applications and it is my job, you can view my <a href="https://undivisible.dev/" class="personal-link">personal website</a> and my <a href="https://atechnology.company/" class="business-link">business website</a>.</p>
                    <p>now, you may notice there are two buttons at the bottom. the left one goes to my <a href="https://buymeacoffee.com/undivisible" class="link-donations">link for donations</a>. i make no money off personal projects like these, so it is appreciated. i always put it back into my projects, charity, or i eat food. i usually work alone, or i have some brothers that help every now and then. however, "the other button" goes to the <a href="https://www.alihsan.org.au/project/emergency-appeal" class="foundation-link">Al-Ihsan Foundation</a>, and they support people who actually need it, unlike me. (i have some other sources of income). i'm just leaving that option open, it's there.</p>
                    <p>jazakAllah khair, tyvm for donating, if you do :)</p>
                </div>
            </div>
        {/if}
        {#if showButtons}
            <div class="buttons" transition:slide={{ duration: 400, easing: cubicOut, axis: 'y' }}>
                <a href="https://buymeacoffee.com/undivisible" class="donate-button">donate here</a>
                <a href="https://www.alihsan.org.au/project/emergency-appeal" class="foundation-button">the other button</a>
            </div>
        {/if}
    </div>
</div>

<style>
    .container {
        display: flex;
        justify-content: center;
        align-items: left;
        height: 100%;
        width: 100%;
        max-width: none;
        font-family: 'Onest', sans-serif;
        background-color: #191919;
    }
    
    .about-container {
        display: flex;
        justify-content: center;
        align-items: left;
        flex-direction: column;
        padding: 1rem;
        max-width: 600px;
        margin: 0 auto;
        overflow: hidden;
    }
    
    h1 {
        font-size: 2.5rem;
        margin-bottom: 1.5rem;
        opacity: 0;
        transition: opacity 0.5s ease;
    }
    
    h1.visible {
        opacity: 1;
        transition: opacity 0.5s ease;
    }
    
    .white-text {
        color: white;
        position: relative;
    }
    
    .white-text::before {
        content: "Assalamualaikum!";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-clip: text;
        -webkit-background-clip: text;
        color: transparent;
        background-size: 300% 100%;
        background-image: linear-gradient(to right, 
            rgba(255, 255, 255, 0), 
            rgba(255,102,0,1),
            rgba(255,255,255,0)
        );
        background-position: -300% center;
        pointer-events: none;
        opacity: 0;
    }
    
    .gradient-active::before {
        animation: gradientSlide 0.5s ease-in-out forwards;
        animation-iteration-count: 1;
        animation-fill-mode: forwards;
    }
    
    @keyframes gradientSlide {
        0% {
            background-position: 0% center;
            opacity: 1;
        }
        99% {
            opacity: 1;
        }
        100% {
            background-position: 100% center;
            opacity: 0;
        }
    }
    
    .content-wrapper {
        position: relative;
    }
    
    .content-fade {
        position: relative;
    }
    
    p {
        margin-bottom: 1rem;
        line-height: 1.6;
    }
    
    .personal-link, .business-link, .link-donations, .foundation-link {
        color: #ff6600;
        text-decoration: none;
    }
    
    .buttons {
        display: flex;
        justify-content: space-between;
        margin-top: 2rem;
        width: 100%;
        padding: 0;
    }
    
    .donate-button, .foundation-button {
        display: inline-block;
        padding: 0.8rem 1.5rem;
        border-radius: 2rem;
        text-decoration: none;
        font-weight: bold;
        color: white;
        text-align: center;
        min-width: 10rem;
    }
    
    .donate-button {
        margin-right: auto;  /* Push to left */
        background-color: #ff6600;
    }
    
    .foundation-button {
        margin-left: auto;  /* Push to right */
        background-color: #ff6600;
    }

    a:hover {
        text-decoration: underline;
    }
</style>