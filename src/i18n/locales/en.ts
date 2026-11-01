import type { Dictionary } from './hu'

export const en: Dictionary = {
  meta: {
    title: 'Web development & web applications',
    description: 'I design and build thoughtful websites and web applications.',
  },
  a11y: {
    skipToContent: 'Skip to content',
    opensInNewTab: '(opens in a new tab)',
  },
  common: {
    backHome: 'Back to home',
  },
  nav: {
    primary: 'Main navigation',
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
    home: 'Home',
    work: 'Work',
    services: 'Services',
    about: 'About',
    lab: 'Lab',
    contact: 'Contact',
  },
  cta: {
    startProject: 'Start a project',
  },
  intro: {
    titleLine1: 'Welcome to',
    titleLine2: 'the next',
    titleLine3: 'dimension',
    titleLine4: 'of the web.',
    supporting: 'A digital space that responds to your movement.',
    cta: 'Click to enter',
    ctaTouch: 'Tap to enter',
    hint: 'Move to distort. Click to enter.',
    hintTouch: 'Drag to distort. Tap to enter.',
    skip: "Don't show this again",
  },
  hero: {
    titleLine1: 'Digital experiences.',
    titleLine2: 'Real impact.',
    description:
      'I design and build websites and web applications where technology, creativity and attention to detail meet.',
    ctaPrimary: 'Explore my work',
    ctaSecondary: "Let's talk about your project",
    scrollCue: 'Scroll to explore',
  },
  theme: {
    darkMode: 'Dark mode',
  },
  language: {
    label: 'Language',
  },
  footer: {
    role: 'Websites and web applications, designed and built.',
    navLabel: 'Footer navigation',
    pagesHeading: 'Pages',
    contactHeading: 'Contact',
    contactIntro: "Have an idea or a question? Let's talk.",
    contactLink: 'Get in touch',
    socialHeading: 'Social profiles',
    legalLabel: 'Legal',
    legal: {
      privacy: 'Privacy',
      legalNotice: 'Legal notice',
    },
    rights: 'All rights reserved.',
  },
  status: {
    live: 'Live',
    demo: 'Demo project',
    inProgress: 'In progress',
    concept: 'Concept',
  },
  projects: {
    technologies: 'Technologies',
  },
  services: {
    priceFrom: 'Starting from',
    priceQuote: 'Request a custom quote',
    priceTbd: 'Pricing to be confirmed',
    priceQuoteHint: 'The price depends on the scope of the project.',
    priceExact: 'The exact amount is given in the quote.',
    vat: {
      excluded: '+ VAT',
      included: 'incl. VAT',
      exempt: 'VAT-exempt',
    },
  },
  servicesPage: {
    meta: {
      title: 'Services and packages',
      description:
        'Custom websites and web applications: services, four starting packages and a custom quote request.',
    },
    hero: {
      titleLine1: 'Your idea.',
      titleLine2: 'The next step.',
      lead: 'Custom websites and web applications that combine a distinctive look with real usability.',
      ctaPrimary: 'Choose a service',
      ctaSecondary: 'Request a custom quote',
      indexLabel: 'On this page',
      index: {
        areas: 'Services',
        packages: 'Packages',
        quote: 'Quote request',
        process: 'Process',
        faq: 'FAQ',
      },
    },
    areas: {
      title: 'What I take on',
      intro:
        'Four areas where I can help. The details change from project to project; the exact content is settled after a quote request.',
      featuresLabel: 'What can be part of it',
      exampleLabel: 'An example from my work',
      cta: 'Request a quote',
    },
    packages: {
      title: 'Packages',
      intro:
        'Four starting structures. They are not final offers: the exact content, price and timing are settled after a quote request, once the project is known.',
      legend: 'Choose a package',
      choose: 'Choose',
      chosen: 'Chosen',
      rows: {
        audience: 'Who it is for',
        fits: 'Suits projects like',
        includes: 'What can be included',
        price: 'Price',
        timeline: 'Timeline',
      },
      timeline: {
        scope: 'Depends on the scope of the project and is fixed in the quote.',
        estimate: 'Typically {range} {unit}, confirmed in the quote.',
        units: {
          days: { one: 'day', other: 'days' },
          weeks: { one: 'week', other: 'weeks' },
          months: { one: 'month', other: 'months' },
        },
      },
      bar: {
        none: 'No package chosen yet. Choose one above, or request a quote without one.',
        some: 'Chosen package: {name}',
        ctaSome: 'Continue to the quote request',
        ctaNone: 'Request a custom quote',
      },
    },
    quote: {
      title: 'Request a custom quote',
      intro:
        'Tell me briefly what you have in mind. Seven questions in four steps; anything optional is marked. You can go back and change your answers at any time.',
      aside: {
        title: 'Good to know',
        items: [
          'Asking for a quote is not placing an order.',
          'Until you send it, your answers exist only on this page, in your browser’s memory: I do not save them anywhere. Reloading the page clears them.',
          'The exact scope, price and timing are settled together after the quote request.',
        ],
      },
      stepsLabel: 'Steps of the quote request',
      stepOf: 'Step {current} of {total}',
      stepDone: 'done',
      stepCurrent: 'current step',
      steps: {
        project: 'Project',
        details: 'Details',
        extras: 'Budget and timing',
        contact: 'Contact',
      },
      stepTitles: {
        project: 'What is it about?',
        details: 'Tell me about the project',
        extras: 'Budget and timing',
        contact: 'How can I reach you?',
      },
      optional: 'optional',
      fields: {
        projectType: {
          label: 'What kind of project is it?',
          options: {
            website: 'A website',
            webapp: 'A web application',
            ui: 'Implementing an existing design',
            integrations: 'An API or integration',
            maintenance: 'Maintaining or developing an existing site',
            unsure: 'Not sure yet',
          },
        },
        package: {
          label: 'Which package interests you?',
          hint: 'If you chose one above, it is already filled in here; you can change it.',
          unsure: 'Not sure yet, help me choose',
        },
        description: {
          label: 'What is the project, briefly?',
          hint: 'What do you want to create, for whom, and what is the goal? A few sentences are enough.',
          count: '{count} / {max}',
        },
        reference: {
          label: 'Is there an existing website or a reference?',
          hint: 'A link, or a few words about something you like.',
        },
        budget: {
          label: 'Approximate budget',
          hint: 'If you have an idea, write it with an amount and currency. If not, leave it empty.',
        },
        timing: {
          label: 'When would you like the project?',
          placeholder: 'I would rather not say',
          options: {
            unsure: 'Not sure yet',
            asap: 'As soon as possible',
            weeks: 'In the coming weeks',
            months: 'In the coming months',
            flexible: 'No rush',
          },
        },
        name: { label: 'Your name', hint: 'A first name is enough.' },
        email: { label: 'Email address', hint: 'This is where I will reply.' },
        phone: { label: 'Phone number', hint: 'Only if you would rather talk by phone.' },
        consent: {
          label: 'I understand that the details I give will be used to answer this quote request.',
          privacy: 'Privacy notice',
          pending: 'The privacy notice path is not set yet: src/config/site.ts',
        },
      },
      errors: {
        required: {
          projectType: 'Choose what kind of project it is.',
          package: 'Choose a package, or say you are not sure yet.',
          description: 'Write a few words about the project.',
          timing: 'Choose from the list, or leave it empty.',
          name: 'Enter your name.',
          email: 'Enter your email address so I can reply.',
        },
        tooShort: 'At least {min} characters are needed here.',
        tooLong: 'No more than {max} characters.',
        invalidEmail: 'That does not look like a valid email address. Check that it has an @ sign followed by a domain.',
        invalidPhone: 'Use digits, spaces and the characters + ( ) - . /, with at least 6 digits.',
        consentRequired: 'You need to tick this to send the request.',
      },
      actions: {
        next: 'Next',
        back: 'Back',
        send: 'Send quote request',
        prepare: 'Prepare summary',
        sending: 'Sending…',
      },
      summary: {
        title: 'Quote request',
        heading: 'Summary',
        reviewHint: 'Check it before you go on.',
        empty: '—',
        labels: {
          projectType: 'Project type',
          package: 'Package',
          description: 'Description',
          reference: 'Existing site or reference',
          budget: 'Budget',
          timing: 'Timing',
          name: 'Name',
          email: 'Email',
          phone: 'Phone',
          language: 'Language',
        },
      },
      unavailable: {
        notice:
          'Online sending is not connected yet. You can go through the questions, but the request cannot leave this page right now: at the end you can copy the summary.',
        title: 'The quote request was not sent',
        text: 'Online sending is not set up yet, so nothing has been sent. Your answers are still here: copy the summary and send it another way.',
        copy: 'Copy summary',
        copied: 'The summary is on your clipboard.',
        copyFailed: 'Copying did not work. Select the text below and copy it by hand.',
        mail: 'Open as an email draft',
        mailNote: 'Your email app opens with a draft; it is only sent when you send it there.',
        subject: 'Quote request',
      },
      failed: {
        title: 'Sending did not work',
        network: 'I could not reach the service. Your answers are still here; check your connection and try again.',
        timeout:
          'Sending took too long, so I cannot tell whether it arrived. Your answers are still here; try again later.',
        rejected: 'The service did not accept the request. Your answers are still here; try again later.',
      },
      sent: {
        title: 'Sent',
        text: 'Your quote request has been sent. I will get back to you at the email address you gave.',
        again: 'New quote request',
      },
    },
    process: {
      title: 'How we work together',
      intro: 'Five steps from idea to handover.',
    },
    faq: {
      title: 'Frequently asked questions',
      intro: 'Honest, general answers. If yours is not here, write it in the quote request.',
    },
    final: {
      title: 'Have an idea?',
      text: 'Let’s see how it can become a working digital product.',
      cta: 'Let’s get started',
    },
  },
  home: {
    path: {
      title: 'Choose your path',
      career: {
        label: 'Careers & employers',
        title: "Let's build something worthwhile together.",
        text: 'Get to know my projects, my technical background and the way I approach problems.',
        cta: 'View portfolio',
      },
      clients: {
        label: 'Clients & businesses',
        title: "Got an idea? Let's make it real.",
        text: 'Modern, responsive websites and web applications for business goals, with thoughtful design and development.',
        cta: 'Start a project',
      },
    },
    work: {
      title: 'Selected work',
      intro: 'A selection of my projects. Each one is marked with the state it is in.',
      conceptSketch: 'Concept sketch',
      imageAlt: 'Screenshot of {name}',
      demo: 'Live demo',
      details: 'Details',
      noDetails: 'The details page is not ready yet.',
      items: {
        spendly: {
          category: 'Finance app',
          description:
            'The concept of a modern finance app for tracking spending clearly and managing everyday money.',
        },
        bookinghub: {
          category: 'Appointment booking web app',
          description:
            'The concept of an appointment booking system that puts the client-side booking flow and the digital experience of the service at the centre.',
        },
        hollandia: {
          category: 'Information website',
          description:
            'A Hungarian-language information platform supporting people who move to the Netherlands and start a new life there.',
        },
        logistics: {
          category: 'Logistics web app',
          description: 'An application concept designed to digitise logistics and haulage processes.',
        },
      },
    },
    build: {
      title: 'What I build',
      items: {
        websites: {
          title: 'Websites',
          text: 'Responsive, modern websites with a distinctive visual identity.',
        },
        webapps: {
          title: 'Web Applications',
          text: 'Interactive applications with carefully considered user flows.',
        },
        mobile: {
          title: 'Mobile Experiences',
          text: 'Interfaces and application experiences optimised for mobile.',
        },
        integrations: {
          title: 'Integrations',
          text: "Connecting APIs and digital services according to the project's actual needs.",
        },
      },
    },
    about: {
      title: 'A good digital experience is no accident.',
      text: 'For me, development is more than writing code. The goal is for an idea to become a thoughtful, usable and visually distinctive digital product.',
      principles: ['Considered', 'Usable', 'Distinctive'],
      principlesLabel: 'Three words that sum up the aim',
      stackHeading: 'What this site is built with',
      stackNote: "The tools are taken from this site's own source code.",
      more: 'More about me',
    },
    lab: {
      title: 'The Lab',
      intro: 'An experimental digital playground: six interactive WebGL experiences, from particles to a generator that builds a 3D object from one sentence. Three samples here, all six wait in the Lab.',
      enter: 'Enter the Lab',
      open: 'Open',
    },
    packages: {
      title: 'How we can work together',
      intro: 'Four starting points. The exact scope and price are fitted to the project.',
      audienceLabel: 'Who it is for',
      includesLabel: 'Includes',
      cta: 'Request a quote',
    },
    final: {
      title: "Let's make it real.",
      text: "Tell me about your idea, and let's see how it can become a working digital experience.",
      cta: "Let's talk about your project",
      emailLead: 'Or write directly:',
    },
  },
  aboutPage: {
    meta: {
      title: 'About me and how I work',
      description:
        'From logistics to software development: my story, how I work, my technologies and what I am focused on now.',
    },
    hero: {
      titleLine1: 'Not just writing code.',
      titleLine2: 'Building digital experiences.',
      lead: 'I believe good development comes from technology, creativity and problem-solving thinking meeting.',
      ctaPrimary: 'See my work',
      ctaSecondary: 'Get in touch',
    },
    story: {
      fromLabel: 'Logistics',
      toLabel: 'Software development',
      skillsTitle: 'What I brought with me',
      skillsIntro: 'Seven skills that carry over from one field to the other, and how each shows up in development.',
    },
    approach: {
      title: 'How I work',
      intro: 'Four principles that lead into one another.',
    },
    skills: {
      title: 'Technologies',
      intro: 'The tools I work with, in groups.',
      note: 'The list names tools; it is not a ranking of skill levels.',
      levels: {
        learning: 'Learning',
        working: 'Working with it',
        confident: 'Confident with it',
      },
    },
    focus: {
      title: 'Current focus',
      intro: 'Where most of my attention goes right now.',
    },
    final: {
      title: 'Let’s build something meaningful.',
      text: 'Every good project starts with a conversation.',
      cta: 'Get in touch',
    },
  },
  contactPage: {
    meta: {
      title: 'Contact',
      description: 'Write to me about a professional opportunity, a collaboration or a web development project.',
    },
    hero: {
      title: 'Got a good idea?',
      lead: 'Let’s talk about it. Whether it is a new project, a professional opportunity or a collaboration, I would be glad to listen.',
      doorsLabel: 'Choose what you would like to talk about',
      employers: {
        label: 'For employers',
        title: 'A professional opportunity, a developer position or teamwork.',
        cta: 'Let’s talk about the opportunity',
      },
      clients: {
        label: 'For clients',
        title: 'A website, a web application or a custom digital solution.',
        cta: 'Start a project',
      },
    },
    form: {
      title: 'Write to me',
      intro: 'A few lines are enough: the topic, a subject and your message, and how I can reply.',
      aside: {
        title: 'Good to know',
        items: [
          'Until you send it, your message exists only on this page, in your browser’s memory: I do not save it anywhere. Reloading the page clears it.',
          'I only need your name and your e-mail address, so that I can reply.',
        ],
      },
      fields: {
        name: { label: 'Your name', hint: 'A first name is enough.' },
        email: { label: 'Email address', hint: 'This is where I will reply.' },
        kind: {
          label: 'What would you like to talk about?',
          options: {
            job: 'A job opportunity',
            collaboration: 'Collaboration',
            project: 'A web development project',
            other: 'Something else',
          },
        },
        subject: { label: 'Subject', hint: 'A few words on what it is about.' },
        message: {
          label: 'Message',
          hint: 'Tell me what you have in mind. A few sentences are enough.',
          count: '{count} / {max}',
        },
        consent: {
          label: 'I understand that the details I give will be used to answer this message.',
          privacy: 'Privacy notice',
          pending: 'The privacy notice path is not set yet: src/config/site.ts',
        },
      },
      subjects: {
        job: 'A professional opportunity',
        collaboration: 'Collaboration',
        project: 'A web development project',
      },
      errors: {
        required: {
          name: 'Enter your name.',
          email: 'Enter your email address so I can reply.',
          kind: 'Choose what you would like to talk about.',
          subject: 'Write a short subject.',
          message: 'Write a few words in the message.',
        },
        tooShort: 'At least {min} characters are needed here.',
        tooLong: 'No more than {max} characters.',
        invalidEmail: 'That does not look like a valid email address. Check that it has an @ sign followed by a domain.',
        consentRequired: 'You need to tick this to send the message.',
      },
      actions: {
        send: 'Send message',
        prepare: 'Prepare summary',
        sending: 'Sending…',
      },
      summary: {
        title: 'Contact',
        heading: 'Summary',
        empty: '—',
        labels: {
          kind: 'Topic',
          subject: 'Subject',
          message: 'Message',
          name: 'Name',
          email: 'Email',
          language: 'Language',
        },
      },
      unavailable: {
        notice:
          'Online sending is not connected yet. You can fill in the form, but the message cannot leave this page right now: at the end you can copy the summary.',
        title: 'The message was not sent',
        text: 'Online sending is not set up yet, so nothing has been sent. Your message is still here: copy the summary and send it another way.',
        copy: 'Copy summary',
        copied: 'The summary is on your clipboard.',
        copyFailed: 'Copying did not work. Select the text below and copy it by hand.',
        mail: 'Open as an email draft',
        mailNote: 'Your email app opens with a draft; it is only sent when you send it there.',
        subject: 'Contact',
      },
      failed: {
        title: 'Sending did not work',
        network: 'I could not reach the service. Your message is still here; check your connection and try again.',
        timeout:
          'Sending took too long, so I cannot tell whether it arrived. Your message is still here; try again later.',
        rejected: 'The service did not accept the message. Your message is still here; try again later.',
      },
      sent: {
        title: 'Sent',
        text: 'Your message has been sent. I will reply at the email address you gave.',
        again: 'New message',
      },
    },
    links: {
      title: 'Other ways to reach me',
    },
  },
  project: {
    backToPortfolio: 'Back to the portfolio',
    repoName: 'In the repository and in the interface: {name}',
    reviewed: 'Based on the documentation and the code, read on {date}',
    sourceLink: 'Source code',
    demoLink: 'Live demo',
    heroImage: 'Screenshot',
    stackLabel: 'Technologies used',
    stackGroups: {
      frontend: 'Frontend',
      backend: 'Backend',
      data: 'Data',
      infrastructure: 'Infrastructure',
      testing: 'Testing',
      services: 'External services',
    },
    sections: {
      overview: 'Overview',
      challenge: 'The challenge',
      approach: 'The approach',
      architecture: 'Technical architecture',
      features: 'Key features',
      decisions: 'Design decisions',
      learned: 'Lessons and next steps',
      gallery: 'Gallery',
    },
    overview: {
      what: 'What it is',
      audience: 'Who it is for',
      problem: 'The problem it addresses',
      goal: 'The goal of building it',
      role: 'My role',
    },
    challenge: {
      problem: 'The problem',
      solution: 'The solution',
      source: 'Documented in',
    },
    architecture: {
      label: "The system's layers, top to bottom",
      connections: 'Connections',
      status: {
        built: 'Works',
        partial: 'Partly works',
        planned: 'Planned',
      },
    },
    features: {
      groups: {
        done: 'Built',
        partial: 'Partly working',
        planned: 'Planned',
      },
      limits: 'What it does not do (yet)',
      showScreenshot: 'Open the screenshot',
    },
    learned: {
      next: 'Possible next steps',
      pending: 'Own lessons: src/content/projectDetails',
    },
    gallery: {
      desktop: 'Desktop',
      mobile: 'Mobile',
      open: 'Open larger: {title}',
      close: 'Close',
      previous: 'Previous image',
      next: 'Next image',
      counter: '{current} / {total}',
      dialog: 'Image gallery',
    },
    nav: {
      label: 'Between projects',
      previous: 'Previous project',
      next: 'Next project',
      all: 'All projects',
    },
  },
  placeholder: {
    description: 'This page is coming soon.',
  },
  notFound: {
    title: 'Page not found',
    description: "This address doesn't exist, or the page has moved.",
  },
}
