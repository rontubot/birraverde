// CSS is handled by the link tag in HTML for file:// compatibility

// Use global gsap if available (from CDN)
const { gsap, ScrollTrigger } = window;
if (gsap) gsap.registerPlugin(ScrollTrigger);

// Initial Hero Animation
const tl = gsap.timeline()

tl.to('.hero-tagline', {
  opacity: 1,
  y: 0,
  duration: 0.8,
  ease: 'power3.out'
})
.to('.hero h1', {
  opacity: 1,
  y: 0,
  duration: 1,
  ease: 'power3.out'
}, '-=0.5')
.to('.hero p', {
  opacity: 1,
  y: 0,
  duration: 0.8,
  ease: 'power3.out'
}, '-=0.7')
.to('.hero-actions .btn', {
  opacity: 1,
  y: 0,
  stagger: 0.2,
  duration: 0.8,
  ease: 'power3.out'
}, '-=0.6')

// Scroll Animations for sections
if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
  gsap.utils.toArray('.reveal').forEach((elem) => {
    gsap.fromTo(elem, 
      { 
        opacity: 0, 
        y: 50 
      }, 
      {
        opacity: 1,
        y: 0,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: elem,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      }
    )
  })
} else {
  // Fallback if GSAP or ScrollTrigger doesn't load
  document.querySelectorAll('.reveal').forEach(el => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.querySelector('nav')
  if (window.scrollY > 50) {
    nav.style.padding = '1rem 0'
    nav.style.background = 'rgba(5, 5, 5, 0.9)'
  } else {
    nav.style.padding = '1.5rem 0'
    nav.style.background = 'rgba(5, 5, 5, 0.5)'
  }
})

// Interactive cards
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    card.style.setProperty('--mouse-x', `${x}px`)
    card.style.setProperty('--mouse-y', `${y}px`)
  })
})
