import { render, screen } from '@testing-library/react';
import ChatMessage from '../../components/ChatMessage';
import { DirectMessage } from '../../db/db';
import { describe, it, expect } from 'vitest';

describe('ChatMessage Component', () => {
  const mockMessage: DirectMessage = {
    id: 1,
    npub: 'npub1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    peerNpub: 'npub1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
    content: 'Hello, world!',
    createdAt: new Date(),
    isRead: false,
    nostrEventId: 'event123',
    // Note: title, updatedAt, tagPageIds are optional in DirectMessage based on Note inheritance
  };

  it('renders message content correctly', () => {
    render(<ChatMessage message={mockMessage} isSender={false} />);
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  it('applies sender styles when isSender is true', () => {
    const { container } = render(<ChatMessage message={mockMessage} isSender={true} />);
    // Check for a class that indicates sender styling
    // This depends on the component's implementation details
    // For example, if senders have a 'justify-end' class:
    expect(container.firstChild).toHaveClass('justify-end');
    // Or check for specific background color class if stable
    const messageBubble = screen.getByText('Hello, world!').parentElement;
    expect(messageBubble).toHaveClass('bg-blue-500');
  });

  it('applies receiver styles when isSender is false', () => {
    const { container } = render(<ChatMessage message={mockMessage} isSender={false} />);
    // Check for a class that indicates receiver styling
    expect(container.firstChild).toHaveClass('justify-start');
    const messageBubble = screen.getByText('Hello, world!').parentElement;
    expect(messageBubble).toHaveClass('bg-gray-200');
  });

  it('displays the message time', () => {
    const messageTime = new Date(mockMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    render(<ChatMessage message={mockMessage} isSender={false} />);
    expect(screen.getByText(messageTime)).toBeInTheDocument();
  });
});
