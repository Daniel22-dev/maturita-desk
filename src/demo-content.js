export const DEMO_TOPIC_TEMPLATE = {
  exam: {
    pictures: {
      intro: 'Compare the two situations. Focus on similarities, differences and your personal preference.',
      instruction: 'Speak for about 2 minutes. Compare both pictures and answer the target question.',
      guidePoints: ['Place and atmosphere', 'People and activities', 'Reasons and consequences', 'Advantages and disadvantages'],
      images: [
        { id: 'A', src: './assets/demo/picture-a.svg', alt: 'Synthetic demo illustration A: a quiet rural journey.' },
        { id: 'B', src: './assets/demo/picture-b.svg', alt: 'Synthetic demo illustration B: movement through a city.' }
      ],
      teacherPrompt: 'If needed: ask the student to move from description to comparison and justify a preference.'
    },
    task: {
      type: 'Decision & Reasoning',
      title: 'THE WEEKEND PLAN',
      scenario: 'A group of four friends has one free Saturday and a limited budget. They want an activity that lets them spend time together, stay active and avoid a long journey.',
      blocks: [
        { type: 'cards', items: ['City walk – low cost, flexible route', 'Cycling trip – active, weather-dependent', 'Indoor sports centre – reliable, higher cost'] },
        { type: 'quote', text: '“We should not plan anything. Spontaneous plans are always better.”' }
      ],
      steps: [
        {
          prompt: 'Choose one of these options: a city walk, a cycling trip, or a day at an indoor sports centre. Give two reasons for your choice.',
          guidance: ['Match the choice to the three conditions.', 'A clear reason is more important than the option itself.'],
          followUp: 'Which of the other two options would be your second choice, and why?'
        },
        {
          prompt: 'Identify one realistic problem your group might face and suggest a solution.',
          guidance: ['Possible areas: weather, equipment, transport, different preferences, cost.'],
          followUp: 'How would your solution change if one friend had an injury?'
        },
        {
          prompt: 'One friend says: “We should not plan anything. Spontaneous plans are always better.” Respond to this opinion.',
          guidance: ['Accept both sides if supported.', 'Listen for a reason plus an example or consequence.'],
          followUp: 'When is spontaneity useful and when can it cause problems?'
        },
        {
          prompt: 'Finish by summarising the final plan in two or three clear sentences.',
          guidance: ['A concise conclusion is enough.', 'The student should keep the decision consistent with earlier arguments.']
        }
      ]
    },
    topic: {
      sections: [
        {
          id: 'daily-life',
          label: 'Everyday choices',
          shortLabel: 'Choices',
          extraPrompts: [
            { prompt: 'When can having too many choices become a disadvantage?', answer: ['decision fatigue', 'difficulty comparing options', 'fear of making a mistake'] }
          ],
          questions: [
            {
              prompt: 'What kinds of decisions do teenagers make every day?',
              answer: ['school and study priorities', 'free time and hobbies', 'money', 'friends and relationships', 'healthy habits'],
              extra: 'Which decisions become easier with experience?'
            },
            {
              prompt: 'Do you prefer planning things in advance or deciding at the last minute? Why?',
              answer: ['Either preference is acceptable if explained.', 'Useful contrasts: control vs flexibility, stress vs spontaneity.']
            },
            {
              prompt: 'Give an example of a small decision that can have a surprisingly big effect.',
              answer: ['sleep routine', 'daily travel', 'saving money', 'regular exercise', 'screen-time habits']
            }
          ]
        },
        {
          id: 'information',
          label: 'Information & decisions',
          shortLabel: 'Information',
          questions: [
            {
              prompt: 'Where do people usually get information before making an important decision?',
              answer: ['friends and family', 'official websites', 'reviews', 'experts', 'news or comparison services'],
              extra: 'Which source would you trust least, and why?'
            },
            {
              prompt: 'How can too much information make a decision more difficult?',
              answer: ['contradictory advice', 'decision fatigue', 'too many options', 'difficulty checking reliability']
            }
          ]
        },
        {
          id: 'money',
          label: 'Money & priorities',
          shortLabel: 'Money',
          questions: [
            {
              prompt: 'What should a young person consider before buying something expensive?',
              answer: ['need vs want', 'budget', 'quality and lifespan', 'alternatives', 'future costs'],
              extra: 'Is the cheapest option usually the best one?'
            },
            {
              prompt: 'Is it better to spend money on things or experiences?',
              answer: ['Both positions are valid.', 'Possible aspects: memories, usefulness, durability, social value.']
            }
          ]
        },
        {
          id: 'pressure',
          label: 'Pressure & influence',
          shortLabel: 'Influence',
          questions: [
            {
              prompt: 'How can friends or social media influence the choices people make?',
              answer: ['peer pressure', 'trends', 'fear of missing out', 'advertising', 'social proof'],
              extra: 'Can influence also be positive? Give an example.'
            },
            {
              prompt: 'What can someone do when they feel pressured into making a quick decision?',
              answer: ['ask for time', 'check facts', 'talk to someone neutral', 'consider consequences', 'say no']
            }
          ]
        },
        {
          id: 'mistakes',
          label: 'Mistakes & learning',
          shortLabel: 'Mistakes',
          questions: [
            {
              prompt: 'Can a bad decision still be useful? Explain.',
              answer: ['learning from consequences', 'better self-knowledge', 'improved planning', 'resilience'],
              extra: 'When should people admit a mistake and change course?'
            },
            {
              prompt: 'What is more important: making the perfect decision or being able to adapt afterwards?',
              answer: ['There is no single correct position.', 'Look for justification, example and a clear conclusion.']
            }
          ]
        }
      ]
    }
  },
  practice: {
    task: {
      title: 'A SMALL CHANGE FOR ONE WEEK',
      intro: 'Choose one realistic change you could try for seven days and explain how you would test whether it helped.',
      blocks: [
        { type: 'list', items: ['less phone use before bed', 'prepare the school bag in advance', 'walk more', 'plan homework earlier'] }
      ],
      steps: [
        {
          prompt: 'Choose one change: less phone use before bed, preparing your school bag in advance, walking more, or planning homework earlier.',
          guidance: ['The student should pick one specific behaviour.', 'Ask for a reason linked to daily life.'],
          followUp: 'What would make this change difficult to keep?'
        },
        {
          prompt: 'Explain how you would measure whether the change was useful.',
          guidance: ['Possible measures: sleep, stress, punctuality, mood, time saved, completed tasks.']
        },
        {
          prompt: 'After four days you miss your target once. Would you continue? Why?',
          guidance: ['Listen for realistic reflection rather than a perfect answer.', 'Possible idea: one failure does not invalidate the experiment.']
        }
      ]
    },
    sections: [
      {
        id: 'routine',
        label: 'Daily routine',
        questions: [
          {
            prompt: 'Which part of your daily routine works well for you, and which part would you like to improve?',
            guidance: ['Encourage two concrete examples.', 'A developed answer should explain why, not just name activities.'],
            followUp: 'What is one small change that would be realistic this week?'
          },
          {
            prompt: 'How much planning do you think a school day needs?',
            guidance: ['Possible directions: timetable, homework, transport, meals, rest.', 'Both highly planned and flexible approaches are acceptable.']
          }
        ]
      },
      {
        id: 'choices',
        label: 'Choices and consequences',
        questions: [
          {
            prompt: 'Give an example of a choice that saves time now but can create a problem later.',
            guidance: ['Procrastination, fast food, skipping preparation, avoiding a difficult conversation.'],
            followUp: 'Why do people still make this choice?'
          },
          {
            prompt: 'When is it useful to ask another person for advice?',
            guidance: ['Important or unfamiliar decisions, strong emotions, technical knowledge, second opinion.']
          }
        ]
      },
      {
        id: 'digital',
        label: 'Digital life',
        questions: [
          {
            prompt: 'How do apps and online reviews help people make decisions?',
            guidance: ['Comparison, convenience, user experience, price information.', 'Also mention the risk of fake or biased reviews.']
          },
          {
            prompt: 'What information should you check before trusting something you see online?',
            guidance: ['Source, date, evidence, author, comparison with another reliable source.'],
            followUp: 'Does a large number of likes make information more reliable?'
          }
        ]
      }
    ]
  }
};

export const TOPICS = Array.from({ length: 20 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    number: String(id).padStart(2, '0'),
    title: id === 14 ? 'EVERYDAY CHOICES' : `DEMO TOPIC ${String(id).padStart(2, '0')}`,
    synthetic: true,
    ...DEMO_TOPIC_TEMPLATE
  };
});
