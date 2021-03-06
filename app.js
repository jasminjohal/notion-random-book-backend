require("dotenv").config();
const path = require("path");

const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

const express = require("express");
const app = express();
const axios = require("axios");

// return a random unread book in the database
app.get("/random-tbr-book", async (req, res) => {
  let unreadBooks = await getBooks("To Read");
  let randomBook = await generateRandomBook(unreadBooks);
  randomBook = extractBookInfo(randomBook);
  await updateWithGoogleAPIInfo(randomBook);
  res.send(randomBook);
});

// return a random unread book of a particular genre in the database
app.get("/random-tbr-book/:genre", async (req, res) => {
  let unreadBooks = await getTBRBooksByGenre(req.params.genre);
  let randomBook = await generateRandomBook(unreadBooks);
  randomBook = extractBookInfo(randomBook);
  await updateWithGoogleAPIInfo(randomBook);
  res.send(randomBook);
});

// return unique genres of unread books in the database
app.get("/tbr-genres", async (req, res) => {
  let unreadBooks = await getBooks("To Read");
  let genres = await getGenres(unreadBooks);
  res.send({ genres: genres });
});

// return books with specific status ("Completed", "To Read", or "In Progress")
async function getBooks(status) {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Status",
      select: {
        equals: status,
      },
    },
    sorts: [
      {
        property: "Title",
        direction: "descending",
      },
    ],
  });
  return response.results;
}

// returns a list of unique genres for the passed books
async function getGenres(books) {
  let genres = new Set();

  for (let i = 0; i < books.length; i++) {
    let book = books[i];
    let bookProps = book.properties;
    const bookGenres = bookProps.Genres.multi_select;
    for (let j = 0; j < bookGenres.length; j++) {
      genres.add(bookGenres[j].name);
    }
  }

  return [...genres];
}

// return unread books of a particular genre
async function getTBRBooksByGenre(genre) {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        {
          property: "Status",
          select: {
            equals: "To Read",
          },
        },
        {
          property: "Genres",
          multi_select: {
            contains: genre,
          },
        },
      ],
    },
    sorts: [
      {
        property: "Title",
        direction: "descending",
      },
    ],
  });

  return response.results;
}

// get title, book cover, author, owned formats, and Notion URL from a book record in database
function extractBookInfo(book) {
  let bookProps = book.properties;
  let title = bookProps["Title"].title[0];
  title = title ? title.plain_text : "Unknown";

  let bookCover = bookProps["Book Cover"].files[0];
  bookCover = bookCover ? bookCover.name : "https://via.placeholder.com/150";

  let author = bookProps["Author"].rich_text[0];
  author = author ? author.plain_text : "Unknown";

  let owned = bookProps["Owned"].multi_select;
  let ownedFormats = [];
  owned.forEach((format) => ownedFormats.push(format.name));

  return {
    title: title,
    bookCover: bookCover,
    author: author,
    ownedFormats: ownedFormats,
    url: book.url,
  };
}

// mutates passed book object by adding description & ISBN-13 from Google Books API and
// overwriting book cover with book cover from Google Books API
async function updateWithGoogleAPIInfo(book) {
  const response = await axios.get(
    `https://www.googleapis.com/books/v1/volumes?q=intitle:${book.title}`
  );

  let description = "";
  let isbn = "";
  let googleBookCover = "";
  if (response.data.items && response.data.items.length !== 0) {
    let firstResult = response.data.items[0].volumeInfo;
    description = firstResult.description;
    let isbnNos = firstResult.industryIdentifiers;
    if (isbnNos) {
      for (let i = 0; i < isbnNos.length; i++) {
        if (isbnNos[i].type === "ISBN_13") {
          isbn = isbnNos[i].identifier;
        }
      }
    }

    if (firstResult.imageLinks) {
      googleBookCover = firstResult.imageLinks.thumbnail;
    }
  }
  // overrides existing book cover with Google Books API book cover
  if (googleBookCover) {
    book.bookCover = googleBookCover;
  }
  book.description = description;
  book.isbn = isbn;
}

// return a random book from a list of books
function generateRandomBook(books) {
  const randomNumber = Math.floor(Math.random() * books.length);
  const randomBook = books[randomNumber];
  return randomBook;
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, console.log(`Server running at http://127.0.0.1/${PORT}...`));
